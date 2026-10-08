import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** null when the site was built without Supabase settings; app/ then wires the offline ports. */
export const supabaseClient: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;
