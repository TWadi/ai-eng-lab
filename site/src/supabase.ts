import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** null when the site was built without Supabase settings; the UI then shows a setup notice. */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

export interface Profile {
  readonly id: string;
  readonly github_username: string;
  readonly display_name: string | null;
  readonly avatar_url: string | null;
  readonly is_member: boolean;
}
