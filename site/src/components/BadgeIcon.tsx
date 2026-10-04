import type { BadgeId } from "../gamify";

/** Hand-drawn sticker glyphs for each badge; strokes use currentColor so badges recolor when locked. */
export const BADGE_PATHS: Record<BadgeId, string> = {
  "first-step": "M9 18c-2 0-3-1.6-3-3.5S7 10 9 10s3 2.6 3 4.5S11 18 9 18Zm7-4c-1.7 0-2.5-1.4-2.5-3S14.3 7 16 7s2.5 2.4 2.5 4-1 3-2.5 3ZM7 7.5a1 1 0 1 1 0-.01M10.5 6a1 1 0 1 1 0-.01M14 4a1 1 0 1 1 0-.01",
  "hat-trick": "M5 19h14M7 19l1.5-9h7L17 19M9 10c0-3 1.3-5 3-5s3 2 3 5M12 13v3",
  "week-warrior": "M12 3l2.5 5.2 5.5.8-4 3.9 1 5.6L12 15.8 7 18.5l1-5.6-4-3.9 5.5-.8Z",
  "on-fire": "M12 21c-3.9 0-6-2.6-6-5.6 0-3.6 3-5.4 3.6-8.9C12 8.3 13 10 13 12c1-.7 1.6-2 1.7-3.3C17 10.4 18 13 18 15.4 18 18.4 15.9 21 12 21Z",
  "quiz-whiz": "M13 3 5 13.5h6L10 21l8-10.5h-6Z",
  "perfectionist": "M4 8l4 3 4-6 4 6 4-3-2 10H6Z M6 21h12",
  "builder": "M14.5 5.5l4 4-9.5 9.5H5v-4ZM12 8l4 4",
  "phase-finisher": "M6 21V4M6 4h11l-2.5 4L17 12H6",
  "rag-master": "M9 4h6M10 4v5L5.5 17A2 2 0 0 0 7.3 20h9.4a2 2 0 0 0 1.8-3L14 9V4M8 14h8",
  "duelist": "M4 4l10 10M4 4h3l9 9M14 14l3 3M17 14l-3 3M20 4L10 14M20 4h-3l-9 9M10 14l-3 3M7 14l3 3",
};

export function BadgeIcon({ id, size = 22 }: { readonly id: BadgeId; readonly size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={BADGE_PATHS[id]} />
    </svg>
  );
}
