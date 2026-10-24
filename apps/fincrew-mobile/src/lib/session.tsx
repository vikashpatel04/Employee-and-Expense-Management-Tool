import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadMe, loadMemberships, type Me } from '@fincrew/data';
import { supabase } from './supabase';

const SHOP_KEY = 'fincrew_shop';

type SessionState = {
  /** False until the stored session (and shop) have been read. */
  ready: boolean;
  session: Session | null;
  /** The person in the current shop; null when signed out or in no shop. */
  me: Me | null;
  switchShop: (shopId: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (permission: string) => boolean;
};

const Ctx = createContext<SessionState | null>(null);

/**
 * Sign-in state for the whole app: the Supabase session, the shops this login belongs to and
 * the chosen one (remembered on the phone), with its permissions — same rules as the website
 * (`@fincrew/data` loadMemberships / loadMe).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async (s: Session | null, shopId?: string | null) => {
    setSession(s);
    if (!s) {
      setMe(null);
      setReady(true);
      return;
    }
    const memberships = await loadMemberships(supabase, s.user.id);
    const chosen = shopId ?? (await AsyncStorage.getItem(SHOP_KEY));
    setMe(await loadMe(supabase, memberships, chosen));
    setReady(true);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void load(s);
      else setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const switchShop = useCallback(
    async (shopId: string) => {
      await AsyncStorage.setItem(SHOP_KEY, shopId);
      await load(session, shopId);
    },
    [load, session],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const can = useCallback((p: string) => !!me?.permissions.includes(p), [me]);

  return (
    <Ctx.Provider value={{ ready, session, me, switchShop, signOut, can }}>{children}</Ctx.Provider>
  );
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
