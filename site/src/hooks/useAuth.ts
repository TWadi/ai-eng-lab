import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Profile } from "../supabase";
import { readAuthError } from "../authError";

export interface AuthState {
  readonly session: Session | null;
  readonly profile: Profile | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly signIn: () => Promise<void>;
  readonly signOut: () => Promise<void>;
}

async function loadProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  // Non-members can't read profiles (RLS), so a signed-in visitor gets null here.
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    console.error("Failed to load profile", error);
    return null;
  }
  return data as Profile | null;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error] = useState(() => readAuthError(window.location.search, window.location.hash));

  useEffect(() => {
    if (error) {
      // Clean the URL so a refresh doesn't show the old error again.
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [error]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    const apply = async (s: Session | null) => {
      const p = s ? await loadProfile(s.user.id) : null;
      if (!active) return;
      setSession(s);
      setProfile(p);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // Defer: Supabase recommends not awaiting other calls inside this callback.
      setTimeout(() => apply(s), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async () => {
    if (!supabase) return;
    const redirectTo = window.location.origin + import.meta.env.BASE_URL;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "github", options: { redirectTo } });
    if (error) console.error("GitHub sign-in failed", error);
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Sign-out failed", error);
  };

  return { session, profile, loading, error, signIn, signOut };
}
