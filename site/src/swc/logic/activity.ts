import type { ProgressByUser } from "./progress";
import { PHASES, type RoadmapItem } from "./roadmap";
import type { Duel, DuelEntry } from "./duels";
import { findChallenge } from "./lab/challenges";
import type { ChallengeSolve } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface QuizResult {
  readonly id: string;
  readonly user_id: string;
  readonly item_id: string;
  readonly score: number;
  readonly total: number;
  readonly completed_at: string;
  /** Set when the attempt came from a quiz duel (it counts as the quiz for that item). */
  readonly source_duel?: string | null;
}

export type ActivityEvent =
  | { readonly kind: "done"; readonly userId: string; readonly itemId: string; readonly at: string }
  | { readonly kind: "quiz"; readonly userId: string; readonly itemId: string; readonly at: string; readonly score: number; readonly total: number }
  /** userId is the winner (or the challenger in a draw). */
  | { readonly kind: "solve"; readonly userId: string; readonly itemId: string; readonly at: string; readonly challengeId: string; readonly title: string; readonly xp: number }
  | { readonly kind: "duel"; readonly userId: string; readonly rivalId: string; readonly itemId: string; readonly at: string; readonly draw: boolean; readonly score: number | null; readonly rivalScore: number | null; readonly challengeId: string | null };

export function findRoadmapItem(itemId: string): RoadmapItem | undefined {
  for (const phase of PHASES) {
    const item = phase.items.find((i) => i.id === itemId);
    if (item) return item;
  }
  return undefined;
}

/** What a duel was about: the roadmap item of a quiz duel, or the challenge of a code race (once revealed). */
export function duelTitle(d: Pick<Duel, "kind" | "item_id" | "challenge_id">): string {
  if (d.kind === "code") {
    const c = d.challenge_id ? findChallenge(d.challenge_id) : undefined;
    return c ? `Code race: ${c.title}` : "Code race (mystery challenge)";
  }
  return (d.item_id && findRoadmapItem(d.item_id)?.title) || d.item_id || "a quiz";
}

/** Newest first. Items that are no longer on the roadmap are skipped. */
export function buildFeed(
  progress: ProgressByUser,
  quizzes: readonly QuizResult[],
  limit = 30,
  duels: readonly Duel[] = [],
  entries: readonly DuelEntry[] = [],
  solves: readonly ChallengeSolve[] = [],
): readonly ActivityEvent[] {
  const done: ActivityEvent[] = Object.entries(progress).flatMap(([userId, items]) =>
    Object.entries(items).map(([itemId, at]) => ({ kind: "done" as const, userId, itemId, at })),
  );
  // A duel's answer sheet also counts as a quiz, but the feed already shows the duel itself.
  const quiz: ActivityEvent[] = quizzes.filter((q) => !q.source_duel).map((q) => ({
    kind: "quiz" as const, userId: q.user_id, itemId: q.item_id, at: q.completed_at, score: q.score, total: q.total,
  }));
  const scoreOf = (duelId: string, userId: string) => entries.find((e) => e.duel_id === duelId && e.user_id === userId)?.score ?? null;
  const duel: ActivityEvent[] = duels
    .filter((d) => d.status === "done" && d.completed_at)
    .map((d) => {
      const userId = d.winner ?? d.challenger;
      const rivalId = userId === d.challenger ? d.opponent : d.challenger;
      return {
        kind: "duel" as const, userId, rivalId, at: d.completed_at!, draw: d.winner === null,
        // A race event hangs off its challenge's roadmap item.
        itemId: d.kind === "code" ? findChallenge(d.challenge_id ?? "")?.item ?? "" : d.item_id ?? "",
        challengeId: d.kind === "code" ? d.challenge_id : null,
        score: d.kind === "code" ? null : scoreOf(d.id, userId), rivalScore: d.kind === "code" ? null : scoreOf(d.id, rivalId),
      };
    });
  const solved: ActivityEvent[] = solves.flatMap((s) => {
    const c = findChallenge(s.challenge_id);
    return c ? [{ kind: "solve" as const, userId: s.user_id, itemId: c.item, at: s.solved_at, challengeId: c.id, title: c.title, xp: c.xp }] : [];
  });
  return [...done, ...quiz, ...duel, ...solved]
    .filter((e) => findRoadmapItem(e.itemId))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

/** Monday 00:00 (local time) of the week containing `d`. */
export function weekStartOf(d: Date): Date {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7;
  return new Date(start.getTime() - daysSinceMonday * DAY_MS);
}

function weekKey(d: Date): number {
  return weekStartOf(d).getTime();
}

export interface WeekStats {
  readonly thisWeek: number;
  /** Consecutive weeks with at least one finished item, counting back from this week (or last week if this one is still empty). */
  readonly streak: number;
}

export function weekStats(doneAt: readonly string[], now: Date): WeekStats {
  const weeks = new Set(doneAt.map((iso) => weekKey(new Date(iso))));
  const current = weekKey(now);
  const thisWeek = doneAt.filter((iso) => weekKey(new Date(iso)) === current).length;

  // Step back one week at a time. 7 days isn't always one week across DST changes, so recompute the Monday each step.
  const prevWeek = (key: number) => weekKey(new Date(key - 3 * DAY_MS));
  let cursor = weeks.has(current) ? current : prevWeek(current);
  let streak = 0;
  while (weeks.has(cursor)) {
    streak += 1;
    cursor = prevWeek(cursor);
  }
  return { thisWeek, streak };
}

export function relativeTime(iso: string, now: Date): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Best completed score per user for one item. */
/** Pass mark for a quiz: 4 out of 5 (80%). Must match passed_quiz() in the quiz_gates_progress migration. */
export const QUIZ_PASS_RATIO = 0.8;

export function isPass(q: Pick<QuizResult, "score" | "total">): boolean {
  return q.total > 0 && q.score * 5 >= q.total * 4;
}

/** Has this player passed the quiz of this item (solo or in a duel)? */
export function hasPassed(quizzes: readonly QuizResult[], userId: string, itemId: string): boolean {
  return quizzes.some((q) => q.user_id === userId && q.item_id === itemId && isPass(q));
}

export function bestScores(quizzes: readonly QuizResult[], itemId: string): Readonly<Record<string, QuizResult>> {
  return quizzes
    .filter((q) => q.item_id === itemId)
    .reduce<Record<string, QuizResult>>((acc, q) => {
      const cur = acc[q.user_id];
      return !cur || q.score / q.total > cur.score / cur.total ? { ...acc, [q.user_id]: q } : acc;
    }, {});
}
