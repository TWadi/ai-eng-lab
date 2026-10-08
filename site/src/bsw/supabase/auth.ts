import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { AuthPort } from "../../rte/ports";
import type { AuthSession, Profile } from "../../swc/logic/types";
import { watchTables } from "./realtime";

function toSession(s: Session | null): AuthSession | null {
  return s ? { userId: s.user.id } : null;
}

/** GitHub sign-in through Supabase Auth. */
export function supabaseAuth(client: SupabaseClient): AuthPort {
  return {
    async currentSession() {
      const { data } = await client.auth.getSession();
      return toSession(data.session);
    },

    onSessionChange(cb) {
      const { data } = client.auth.onAuthStateChange((_event, s) => {
        // Defer: Supabase recommends not calling other APIs inside this callback.
        setTimeout(() => cb(toSession(s)), 0);
      });
      return () => data.subscription.unsubscribe();
    },

    async loadProfile(userId) {
      const { data, error } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) {
        console.error("Failed to load profile", error);
        return null;
      }
      return data as Profile | null;
    },

    watchProfile(userId, cb) {
      return watchTables(client, `my-profile-${userId}`, [{ table: "profiles", filter: `id=eq.${userId}`, on: cb }]);
    },

    async signIn() {
      const redirectTo = window.location.origin + import.meta.env.BASE_URL;
      const { error } = await client.auth.signInWithOAuth({ provider: "github", options: { redirectTo } });
      if (error) console.error("GitHub sign-in failed", error);
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) console.error("Sign-out failed", error);
    },
  };
}
