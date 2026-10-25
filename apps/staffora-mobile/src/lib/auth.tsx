import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { toShopRules } from '@fincrew/data';
import { supabase } from './supabase';

const DEVICE_KEY = 'staffora_device';
const PROFILE_KEY = 'staffora_profile';
const BIOMETRIC_KEY = 'staffora_biometric';

/** Who this phone belongs to, kept on the phone after signing in (no secrets). */
export type Profile = {
  personId: string;
  shopId: string;
  name: string;
  shopName: string;
  /** The phone number they signed in with (their Staffora user id). */
  phone?: string;
};

type Session = { access_token: string; refresh_token: string };
export type AuthReply =
  | { ok: true; personId: string; shopId: string; session: Session }
  | {
      ok: false;
      reason: string;
      retryAt?: string;
      triesLeft?: number;
    };

/** Who a phone number belongs to (`staff-auth` lookup). */
export type Found = { personId: string; firstName: string; shopName: string; hasPin: boolean };
export type LookupReply = ({ ok: true } & Found) | { ok: false; reason: string };

/** `change_pin` (migration 20261025000001): ok, or why not (bad_pin, same_pin, sign-in reasons). */
export type ChangePinReply =
  { ok: true } | { ok: false; reason: string; retryAt?: string; triesLeft?: number };

export type UnlockReply = { ok: true } | { ok: false; reason: string };

/** This phone's id: made once, kept on the phone; the server ties the sign-in to it. */
export async function deviceId(): Promise<string> {
  const saved = await AsyncStorage.getItem(DEVICE_KEY);
  if (saved) return saved;
  const id = randomUUID();
  await AsyncStorage.setItem(DEVICE_KEY, id);
  return id;
}

/** Call the `staff-auth` edge function (phone lookup, first PIN, PIN sign-in). */
export async function staffAuth(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  try {
    const res = await fetch(`${url}/functions/v1/staff-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify(body),
    });
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Fingerprint / face unlock can be offered: a real phone with one set up. */
export async function biometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return (
    (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())
  );
}

type AuthState = {
  /** False until the phone's saved profile has been read. */
  ready: boolean;
  profile: Profile | null;
  /** True after the PIN (or fingerprint) opened Staffora this time. */
  unlocked: boolean;
  /** This phone opens Staffora with the fingerprint (the person turned it on in Me). */
  biometricOn: boolean;
  /** Who a phone number belongs to, and whether they have a PIN yet. */
  lookup: (phone: string) => Promise<LookupReply>;
  /** First PIN (or a new one after the shop reset it): set it, tie the phone, sign in. */
  setUp: (
    phone: string,
    pin: string,
    names: { firstName: string; shopName: string },
  ) => Promise<AuthReply>;
  /** Sign in on a phone that isn't set up yet, for someone who already has a PIN. */
  signIn: (phone: string, found: Found, pin: string) => Promise<AuthReply>;
  /** Open Staffora with the PIN. */
  unlock: (pin: string) => Promise<AuthReply>;
  /** Open Staffora with the fingerprint; `prompt` is shown by the phone. */
  unlockWithBiometric: (prompt: string) => Promise<UnlockReply>;
  /** Turn fingerprint opening on (asks for the fingerprint once) or off. */
  setBiometric: (on: boolean, prompt: string) => Promise<boolean>;
  /** Set a new PIN, giving the current one (checked like a sign-in). */
  changePin: (current: string, next: string) => Promise<ChangePinReply>;
  /** Close until the PIN (or fingerprint) opens it again. */
  lock: () => Promise<void>;
  /** Forget this phone's sign-in entirely (sign in with the number again). */
  forget: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

/**
 * Staffora sign-in (docs/DECISIONS.md, 2026-10-25): the phone number the shop saved is the user
 * id; the first time the person chooses a 4-digit PIN, which ties the sign-in to this phone, and
 * afterwards every open asks for the PIN (or the fingerprint, if they turned it on and the shop
 * allows it). Sign-ins go through the `staff-auth` edge function, which returns a normal Supabase
 * session, so RLS shows this person only their own records.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);

  useEffect(() => {
    void Promise.all([AsyncStorage.getItem(PROFILE_KEY), AsyncStorage.getItem(BIOMETRIC_KEY)]).then(
      ([p, b]) => {
        setProfile(p ? (JSON.parse(p) as Profile) : null);
        setBiometricOn(b === '1');
        setReady(true);
      },
    );
  }, []);

  const start = useCallback(async (r: Record<string, unknown>) => {
    const reply = r as AuthReply;
    if (!reply.ok) return reply;
    await supabase.auth.setSession(reply.session);
    setUnlocked(true);
    return reply;
  }, []);

  /** Keep who this phone belongs to; the full name comes from their own record. */
  const remember = useCallback(
    async (r: { personId: string; shopId: string }, phone: string, first: string, shop: string) => {
      const { data } = await supabase
        .from('people')
        .select('name')
        .eq('id', r.personId)
        .maybeSingle();
      const p: Profile = {
        personId: r.personId,
        shopId: r.shopId,
        name: data?.name ?? first,
        shopName: shop,
        phone,
      };
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
      setProfile(p);
    },
    [],
  );

  const lookup = useCallback<AuthState['lookup']>(
    async (phone) => (await staffAuth({ action: 'lookup', phone })) as LookupReply,
    [],
  );

  const setUp = useCallback<AuthState['setUp']>(
    async (phone, pin, names) => {
      const r = await start(
        await staffAuth({ action: 'setup', phone, pin, deviceId: await deviceId() }),
      );
      if (r.ok) await remember(r, phone, names.firstName, names.shopName);
      return r;
    },
    [start, remember],
  );

  const signIn = useCallback<AuthState['signIn']>(
    async (phone, found, pin) => {
      const r = await start(
        await staffAuth({
          action: 'login',
          personId: found.personId,
          pin,
          deviceId: await deviceId(),
        }),
      );
      if (r.ok) await remember(r, phone, found.firstName, found.shopName);
      return r;
    },
    [start, remember],
  );

  const unlock = useCallback<AuthState['unlock']>(
    async (pin) => {
      if (!profile) return { ok: false, reason: 'no_login' };
      return start(
        await staffAuth({
          action: 'login',
          personId: profile.personId,
          pin,
          deviceId: await deviceId(),
        }),
      );
    },
    [profile, start],
  );

  const unlockWithBiometric = useCallback<AuthState['unlockWithBiometric']>(
    async (prompt) => {
      if (!profile) return { ok: false, reason: 'no_login' };
      const auth = await LocalAuthentication.authenticateAsync({ promptMessage: prompt });
      if (!auth.success) return { ok: false, reason: 'cancelled' };
      // The session kept on the phone since the last PIN; refreshed if it expired.
      const { data } = await supabase.auth.getSession();
      if (!data.session) return { ok: false, reason: 'no_session' };
      // Still on the staff list, on this phone (the PIN sign-in checks the same).
      const { data: me } = await supabase
        .from('staff')
        .select('status, device_id')
        .eq('person_id', profile.personId)
        .maybeSingle();
      const device = await deviceId();
      if (!me || me.status !== 'active' || (me.device_id && me.device_id !== device)) {
        await supabase.auth.signOut({ scope: 'local' });
        return { ok: false, reason: !me || me.status !== 'active' ? 'left' : 'wrong_device' };
      }
      // The shop may have turned fingerprint opening off since (Settings → Staff sign-in).
      const { data: shop } = await supabase
        .from('shops')
        .select('settings')
        .eq('id', profile.shopId)
        .maybeSingle();
      if (!toShopRules(shop?.settings).staffLogin.allowBiometrics) {
        await AsyncStorage.removeItem(BIOMETRIC_KEY);
        setBiometricOn(false);
        await supabase.auth.signOut({ scope: 'local' });
        return { ok: false, reason: 'not_allowed' };
      }
      setUnlocked(true);
      return { ok: true };
    },
    [profile],
  );

  const setBiometric = useCallback<AuthState['setBiometric']>(async (on, prompt) => {
    if (on) {
      const auth = await LocalAuthentication.authenticateAsync({ promptMessage: prompt });
      if (!auth.success) return false;
      await AsyncStorage.setItem(BIOMETRIC_KEY, '1');
    } else {
      await AsyncStorage.removeItem(BIOMETRIC_KEY);
    }
    setBiometricOn(on);
    return true;
  }, []);

  const changePin = useCallback<AuthState['changePin']>(
    async (current, next) => {
      if (!profile) return { ok: false, reason: 'no_login' };
      const { data, error } = await supabase.rpc('change_pin', {
        p_person: profile.personId,
        p_current: current,
        p_new: next,
        p_device: await deviceId(),
      });
      if (error || !data) return { ok: false, reason: 'network' };
      return data as ChangePinReply;
    },
    [profile],
  );

  const lock = useCallback(async () => {
    // With the fingerprint on, the session stays on the phone for the next fingerprint open.
    if (!biometricOn) await supabase.auth.signOut({ scope: 'local' });
    setUnlocked(false);
  }, [biometricOn]);

  const forget = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' });
    await AsyncStorage.multiRemove([PROFILE_KEY, BIOMETRIC_KEY]);
    setProfile(null);
    setBiometricOn(false);
    setUnlocked(false);
  }, []);

  return (
    <Ctx.Provider
      value={{
        ready,
        profile,
        unlocked,
        biometricOn,
        lookup,
        setUp,
        signIn,
        unlock,
        unlockWithBiometric,
        setBiometric,
        changePin,
        lock,
        forget,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
