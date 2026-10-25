import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

const DEVICE_KEY = 'staffora_device';
const PROFILE_KEY = 'staffora_profile';

/** Who this phone belongs to, kept on the phone after the invite (no secrets). */
export type Profile = { personId: string; shopId: string; name: string; shopName: string };

type Session = { access_token: string; refresh_token: string };
export type AuthReply =
  | { ok: true; personId: string; shopId: string; session: Session }
  | {
      ok: false;
      reason: string;
      retryAt?: string;
      triesLeft?: number;
    };

/** `change_pin` (migration 20261025000001): ok, or why not (bad_pin, same_pin, sign-in reasons). */
export type ChangePinReply =
  { ok: true } | { ok: false; reason: string; retryAt?: string; triesLeft?: number };

/** This phone's id: made once, kept on the phone; the server ties the sign-in to it. */
export async function deviceId(): Promise<string> {
  const saved = await AsyncStorage.getItem(DEVICE_KEY);
  if (saved) return saved;
  const id = randomUUID();
  await AsyncStorage.setItem(DEVICE_KEY, id);
  return id;
}

/** Call the `staff-auth` edge function (invite lookup, accept, PIN sign-in). */
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

type AuthState = {
  /** False until the phone's saved profile has been read. */
  ready: boolean;
  profile: Profile | null;
  /** True after the PIN (or the invite) opened Staffora this time. */
  unlocked: boolean;
  /** Use an invite: set the PIN, tie the phone, sign in. */
  join: (
    token: string,
    pin: string,
    names: { name: string; shopName: string },
  ) => Promise<AuthReply>;
  /** Open Staffora with the PIN. */
  unlock: (pin: string) => Promise<AuthReply>;
  /** Set a new PIN, giving the current one (checked like a sign-in). */
  changePin: (current: string, next: string) => Promise<ChangePinReply>;
  /** Close until the PIN is typed again. */
  lock: () => Promise<void>;
  /** Forget this phone's sign-in entirely (a new invite is needed). */
  forget: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

/**
 * Staffora sign-in (PLAN §6.3): an invite link sets a 4-digit PIN and ties the sign-in to this
 * phone; afterwards every open asks for the PIN. Both go through the `staff-auth` edge function,
 * which returns a normal Supabase session, so RLS shows this person only their own records.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(PROFILE_KEY).then((v) => {
      setProfile(v ? (JSON.parse(v) as Profile) : null);
      setReady(true);
    });
  }, []);

  const start = useCallback(async (r: Record<string, unknown>) => {
    const reply = r as AuthReply;
    if (!reply.ok) return reply;
    await supabase.auth.setSession(reply.session);
    setUnlocked(true);
    return reply;
  }, []);

  const join = useCallback<AuthState['join']>(
    async (token, pin, names) => {
      const r = await start(
        await staffAuth({ action: 'accept', token, pin, deviceId: await deviceId() }),
      );
      if (r.ok) {
        const p: Profile = { personId: r.personId, shopId: r.shopId, ...names };
        await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
        setProfile(p);
      }
      return r;
    },
    [start],
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
    await supabase.auth.signOut({ scope: 'local' });
    setUnlocked(false);
  }, []);

  const forget = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' });
    await AsyncStorage.removeItem(PROFILE_KEY);
    setProfile(null);
    setUnlocked(false);
  }, []);

  return (
    <Ctx.Provider value={{ ready, profile, unlocked, join, unlock, changePin, lock, forget }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
