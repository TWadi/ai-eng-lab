import { PHASES } from "./roadmap";

/** Page metadata as listed in the sidebar (content is fetched separately when a page opens). */
export interface PageMeta {
  readonly id: string;
  readonly user_id: string;
  readonly track_id: string | null;
  readonly item_id: string | null;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface Track {
  readonly id: string | null;
  readonly short: string;
  readonly title: string;
}

export const GENERAL: Track = { id: null, short: "—", title: "General" };

/** Sidebar sections: every roadmap phase/track, then General for anything else. */
export const TRACKS: readonly Track[] = [
  ...PHASES.map((p) => ({ id: p.id, short: p.short, title: p.title })),
  GENERAL,
];

export const MAX_TITLE = 200;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

export function displayTitle(title: string): string {
  return title.trim() || "Untitled";
}

export function cleanTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
}

export function trackOf(page: Pick<PageMeta, "track_id">): Track {
  return TRACKS.find((t) => t.id === page.track_id) ?? GENERAL;
}

export interface TrackGroup {
  readonly track: Track;
  readonly pages: readonly PageMeta[];
}

/** Group pages by track in roadmap order; oldest first inside a track, like a notebook. */
export function groupByTrack(pages: readonly PageMeta[], authorId: string | null = null): readonly TrackGroup[] {
  const visible = authorId ? pages.filter((p) => p.user_id === authorId) : pages;
  return TRACKS.map((track) => ({
    track,
    pages: visible
      .filter((p) => (p.track_id ?? null) === track.id || (track.id === null && !TRACKS.some((t) => t.id === p.track_id)))
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}

export function upsertPage(pages: readonly PageMeta[], page: PageMeta): readonly PageMeta[] {
  return pages.some((p) => p.id === page.id) ? pages.map((p) => (p.id === page.id ? page : p)) : [...pages, page];
}

export function removePage(pages: readonly PageMeta[], id: string): readonly PageMeta[] {
  return pages.filter((p) => p.id !== id);
}

export function pageIdFromHash(hash: string): string | null {
  const m = /^#notes\/([0-9a-f-]{36})$/i.exec(hash);
  return m ? m[1] : null;
}

export type ImageCheck = { readonly ok: true } | { readonly ok: false; readonly error: string };

export function checkImage(file: { type: string; size: number }): ImageCheck {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: "Only PNG, JPEG, GIF and WebP images can be added." };
  }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Images can be at most 5 MB." };
  return { ok: true };
}

export function imageExtension(type: string): string {
  return { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[type] ?? "bin";
}
