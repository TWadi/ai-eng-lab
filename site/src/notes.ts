import { PHASES } from "./roadmap";

export interface Note {
  readonly id: string;
  readonly user_id: string;
  readonly title: string;
  readonly body: string;
  readonly source_url: string | null;
  readonly item_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface NoteInput {
  readonly title: string;
  readonly body: string;
  readonly source_url: string | null;
  readonly item_id: string | null;
}

export interface NoteFilter {
  readonly userId: string | null;
  readonly phaseId: string | null;
}

export const LIMITS = { title: 200, body: 20000, url: 2000 } as const;

type Result = { readonly ok: true; readonly value: NoteInput } | { readonly ok: false; readonly error: string };

/** Mirrors the database check constraints so people get a clear message before saving. */
export function validateNote(raw: { title: string; body: string; source_url: string; item_id: string }): Result {
  const title = raw.title.trim();
  const body = raw.body.trim();
  const url = raw.source_url.trim();
  const itemId = raw.item_id.trim();

  if (!title) return { ok: false, error: "Give the note a title." };
  if (title.length > LIMITS.title) return { ok: false, error: `Keep the title under ${LIMITS.title} characters.` };
  if (!body) return { ok: false, error: "Write something in the note." };
  if (body.length > LIMITS.body) return { ok: false, error: `Notes can be at most ${LIMITS.body} characters.` };
  if (url && !/^https?:\/\/\S+$/.test(url)) return { ok: false, error: "The source link must start with http:// or https://." };
  if (url.length > LIMITS.url) return { ok: false, error: "The source link is too long." };
  if (itemId && !findItem(itemId)) return { ok: false, error: "Pick a roadmap item from the list." };

  return { ok: true, value: { title, body, source_url: url || null, item_id: itemId || null } };
}

export function findItem(itemId: string) {
  for (const phase of PHASES) {
    const item = phase.items.find((i) => i.id === itemId);
    if (item) return { phase, item };
  }
  return undefined;
}

export function phaseOfItem(itemId: string | null): string | null {
  return itemId ? findItem(itemId)?.phase.id ?? null : null;
}

export function filterNotes(notes: readonly Note[], filter: NoteFilter): readonly Note[] {
  return notes.filter(
    (n) =>
      (!filter.userId || n.user_id === filter.userId) &&
      (!filter.phaseId || phaseOfItem(n.item_id) === filter.phaseId),
  );
}

export function sortNewestFirst(notes: readonly Note[]): readonly Note[] {
  return [...notes].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function upsertNote(notes: readonly Note[], note: Note): readonly Note[] {
  const exists = notes.some((n) => n.id === note.id);
  return sortNewestFirst(exists ? notes.map((n) => (n.id === note.id ? note : n)) : [...notes, note]);
}

export function removeNote(notes: readonly Note[], id: string): readonly Note[] {
  return notes.filter((n) => n.id !== id);
}

/** Split text into plain strings and links so URLs in a note are clickable without rendering HTML. */
export function linkify(text: string): ReadonlyArray<{ readonly text: string; readonly href?: string }> {
  const parts: Array<{ text: string; href?: string }> = [];
  const re = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: m[0], href: m[0] });
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
