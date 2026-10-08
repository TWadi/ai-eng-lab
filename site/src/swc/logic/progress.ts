import type { Phase } from "./roadmap";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface ProgressRow {
  readonly user_id: string;
  readonly item_id: string;
  readonly done_at: string;
}

/** userId -> itemId -> ISO timestamp it was finished */
export type ProgressByUser = Readonly<Record<string, Readonly<Record<string, string>>>>;

export function groupByUser(rows: readonly ProgressRow[]): ProgressByUser {
  return rows.reduce<Record<string, Record<string, string>>>(
    (acc, r) => ({ ...acc, [r.user_id]: { ...acc[r.user_id], [r.item_id]: r.done_at } }),
    {},
  );
}

export function withItem(progress: ProgressByUser, userId: string, itemId: string, doneAt: string): ProgressByUser {
  return { ...progress, [userId]: { ...progress[userId], [itemId]: doneAt } };
}

export function withoutItem(progress: ProgressByUser, userId: string, itemId: string): ProgressByUser {
  const rest = Object.fromEntries(Object.entries(progress[userId] ?? {}).filter(([id]) => id !== itemId));
  return { ...progress, [userId]: rest };
}

/** Count only ids that are still on the roadmap, so removed items don't inflate the score. */
export function countDone(done: Readonly<Record<string, string>> | undefined, validIds: readonly string[]): number {
  if (!done) return 0;
  return validIds.filter((id) => id in done).length;
}

export function percent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** 1-based week number relative to start; 0 or negative before the start date. */
export function weekNumber(start: Date, now: Date): number {
  return Math.floor((now.getTime() - start.getTime()) / WEEK_MS) + 1;
}

export function weekStart(start: Date, week: number): Date {
  return new Date(start.getTime() + (week - 1) * WEEK_MS);
}

export function phaseForWeek(phases: readonly Phase[], week: number): Phase | undefined {
  if (week < 1) return phases[0];
  return phases.find((p) => week >= p.weeks[0] && week <= p.weeks[1]);
}
