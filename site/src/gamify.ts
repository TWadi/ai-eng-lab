import { bestScores, weekStartOf, weekStats, type QuizResult } from "./activity";
import type { ProgressByUser } from "./progress";
import { PHASES, type Phase, type RoadmapItem } from "./roadmap";

/** How much XP each action is worth. Build items are worth more because they take longer. */
export const XP = {
  learn: 10,
  setup: 10,
  build: 30,
  quizPerCorrect: 4,
  quizPerfectBonus: 10,
  phaseComplete: 50,
} as const;

export const LEVEL_TITLES = [
  "Prompt Padawan",
  "Token Tinkerer",
  "Vector Voyager",
  "Embedding Explorer",
  "Retrieval Ranger",
  "Chunk Champion",
  "Agent Architect",
  "Model Maestro",
  "AI Engineer",
  "Lab Legend",
] as const;

export type BadgeId =
  | "first-step" | "hat-trick" | "week-warrior" | "on-fire" | "quiz-whiz"
  | "perfectionist" | "builder" | "phase-finisher" | "rag-master";

export interface BadgeDef {
  readonly id: BadgeId;
  readonly name: string;
  readonly description: string;
}

export const BADGES: readonly BadgeDef[] = [
  { id: "first-step", name: "First Step", description: "Finish your first item" },
  { id: "hat-trick", name: "Hat Trick", description: "Finish 3 items in one day" },
  { id: "week-warrior", name: "Week Warrior", description: "2-week streak" },
  { id: "on-fire", name: "On Fire", description: "4-week streak" },
  { id: "quiz-whiz", name: "Quiz Whiz", description: "Score 5/5 on a quiz" },
  { id: "perfectionist", name: "Perfectionist", description: "5 perfect quizzes" },
  { id: "builder", name: "Builder", description: "Finish 3 build items" },
  { id: "phase-finisher", name: "Phase Finisher", description: "Complete a whole phase" },
  { id: "rag-master", name: "RAG Master", description: "Finish every RAG video" },
];

export interface LevelInfo {
  readonly level: number;
  readonly title: string;
  readonly floorXp: number;
  readonly nextXp: number;
  /** 0..1 progress towards the next level. */
  readonly progress: number;
}

/** Level L starts at 25 x (L-1)^2 XP: 0, 25, 100, 225, 400, ... Early levels come fast, later ones take real work. */
export function levelForXp(xp: number): LevelInfo {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 25)) + 1;
  const floorXp = 25 * (level - 1) ** 2;
  const nextXp = 25 * level ** 2;
  const title = LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1];
  return { level, title, floorXp, nextXp, progress: (xp - floorXp) / (nextXp - floorXp) };
}

export function itemXp(item: Pick<RoadmapItem, "kind">): number {
  return XP[item.kind];
}

export function quizXp(score: number, total: number): number {
  return score * XP.quizPerCorrect + (total > 0 && score === total ? XP.quizPerfectBonus : 0);
}

const ITEMS = new Map(PHASES.flatMap((p) => p.items.map((i) => [i.id, i] as const)));

export function phaseDone(phase: Phase, done: Readonly<Record<string, string>>): boolean {
  return phase.items.length > 0 && phase.items.every((i) => i.id in done);
}

export interface PlayerStats {
  readonly userId: string;
  readonly xp: number;
  readonly weekXp: number;
  readonly level: LevelInfo;
  readonly itemsDone: number;
  readonly perfectQuizzes: number;
  readonly phasesComplete: readonly string[];
  readonly streak: number;
  readonly thisWeek: number;
  readonly badges: ReadonlySet<BadgeId>;
}

export function playerStats(
  userId: string,
  progress: ProgressByUser,
  quizzes: readonly QuizResult[],
  now: Date,
): PlayerStats {
  const done = progress[userId] ?? {};
  const doneItems = Object.keys(done).map((id) => ITEMS.get(id)).filter((i): i is RoadmapItem => Boolean(i));
  const weekStart = weekStartOf(now).getTime();

  const itemPoints = doneItems.reduce((sum, i) => sum + itemXp(i), 0);
  const itemWeekPoints = doneItems
    .filter((i) => new Date(done[i.id]).getTime() >= weekStart)
    .reduce((sum, i) => sum + itemXp(i), 0);

  // Quizzes count once per item: the best attempt.
  const mine = quizzes.filter((q) => q.user_id === userId);
  const bestPerItem = [...new Set(mine.map((q) => q.item_id))]
    .map((itemId) => bestScores(mine, itemId)[userId])
    .filter((q): q is QuizResult => Boolean(q));
  const quizPoints = bestPerItem.reduce((sum, q) => sum + quizXp(q.score, q.total), 0);
  const quizWeekPoints = bestPerItem
    .filter((q) => new Date(q.completed_at).getTime() >= weekStart)
    .reduce((sum, q) => sum + quizXp(q.score, q.total), 0);
  const perfectQuizzes = bestPerItem.filter((q) => q.score === q.total).length;

  const phasesComplete = PHASES.filter((p) => phaseDone(p, done)).map((p) => p.id);
  const xp = itemPoints + quizPoints + phasesComplete.length * XP.phaseComplete;
  const { streak, thisWeek } = weekStats(Object.values(done), now);

  const perDay = Object.values(done).reduce<Record<string, number>>((acc, iso) => {
    const day = new Date(iso).toDateString();
    return { ...acc, [day]: (acc[day] ?? 0) + 1 };
  }, {});

  const earned: BadgeId[] = [
    doneItems.length >= 1 && "first-step",
    Object.values(perDay).some((n) => n >= 3) && "hat-trick",
    streak >= 2 && "week-warrior",
    streak >= 4 && "on-fire",
    perfectQuizzes >= 1 && "quiz-whiz",
    perfectQuizzes >= 5 && "perfectionist",
    doneItems.filter((i) => i.kind === "build").length >= 3 && "builder",
    phasesComplete.length >= 1 && "phase-finisher",
    phasesComplete.includes("rag") && "rag-master",
  ].filter((b): b is BadgeId => Boolean(b));

  return {
    userId, xp, weekXp: itemWeekPoints + quizWeekPoints, level: levelForXp(xp),
    itemsDone: doneItems.length, perfectQuizzes, phasesComplete, streak, thisWeek, badges: new Set(earned),
  };
}

/** Highest XP first; ties go to whoever earned more this week. */
export function rankPlayers(stats: readonly PlayerStats[]): readonly PlayerStats[] {
  return [...stats].sort((a, b) => b.xp - a.xp || b.weekXp - a.weekXp);
}

/** The next unfinished items for a player, starting from the given phase. */
export function nextQuests(phases: readonly Phase[], fromPhaseId: string | undefined, done: Readonly<Record<string, string>>, limit = 3) {
  const start = Math.max(0, phases.findIndex((p) => p.id === fromPhaseId));
  return phases
    .slice(start)
    .flatMap((p) => p.items.filter((i) => !(i.id in done)).map((item) => ({ phase: p, item })))
    .slice(0, limit);
}
