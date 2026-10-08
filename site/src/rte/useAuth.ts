import { useEffect, useState } from "react";
import { readAuthError } from "../swc/logic/authError";
import type { AuthSession, Profile } from "../swc/logic/types";
import { useRte } from "./RteContext";

export interface AuthState {
  readonly session: AuthSession | null;
  /** Own profile; is_member tells whether they've been let in. */
  readonly profile: Profile | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly signIn: () => Promise<void>;
  readonly signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const { auth, configured } = useRte();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(configured);
  const [error] = useState(() => readAuthError(window.location.search, window.location.hash));

  useEffect(() => {
    // Clean the URL so a refresh doesn't show the old sign-in error again.
    if (error) window.history.replaceState(null, "", window.location.pathname);
  }, [error]);

  useEffect(() => {
    let active = true;
    const apply = async (s: AuthSession | null) => {
      const p = s ? await auth.loadProfile(s.userId) : null;
      if (!active) return;
      setSession(s);
      setProfile(p);
      setLoading(false);
    };
    void auth.currentSession().then(apply);
    const stop = auth.onSessionChange((s) => void apply(s));
    return () => {
      active = false;
      stop();
    };
  }, [auth]);

  // When an admin lets this user in, pick it up without a reload.
  const userId = session?.userId ?? null;
  const isMember = profile?.is_member ?? false;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const refresh = async () => {
      const p = await auth.loadProfile(userId);
      if (active) setProfile(p);
    };
    const stop = auth.watchProfile(userId, () => void refresh());
    // Fallback in case realtime is unavailable: check every 20 s while waiting to be let in.
    const t = isMember ? undefined : window.setInterval(() => void refresh(), 20_000);
    return () => {
      active = false;
      window.clearInterval(t);
      stop();
    };
  }, [auth, userId, isMember]);

  return { session, profile, loading, error, signIn: auth.signIn, signOut: auth.signOut };
}
