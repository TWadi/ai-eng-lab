/** Supabase reports a failed OAuth round-trip as ?error_description=... (or in the hash) on the redirect URL. */
export function readAuthError(search: string, hash: string): string | null {
  const fromQuery = new URLSearchParams(search).get("error_description");
  const fromHash = new URLSearchParams(hash.replace(/^#/, "")).get("error_description");
  const raw = fromQuery ?? fromHash;
  return raw ? `Sign-in failed: ${raw}` : null;
}
