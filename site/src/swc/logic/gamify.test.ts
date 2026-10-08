import { describe, expect, it } from "vitest";
import { levelForXp, nextQuests, playerStats, quizXp, rankPlayers, XP } from "./gamify";
import { PHASES } from "./roadmap";
import type { QuizResult } from "./activity";

const now = new Date(2026, 9, 14, 12); // Wednesday 14 Oct 2026
const iso = (d: number, h = 10) => new Date(2026, 9, d, h).toISOString();
const quiz = (over: Partial<QuizResult>): QuizResult => ({
  id: "q", user_id: "a", item_id: "rag-1", score: 3, total: 5, completed_at: iso(13), ...over,
});

describe("levels", () => {
  it("follows 25 x (L-1)^2 thresholds", () => {
    expect(levelForXp(0)).toMatchObject({ level: 1, floorXp: 0, nextXp: 25, title: "Prompt Padawan" });
    expect(levelForXp(24).level).toBe(1);
    expect(levelForXp(25).level).toBe(2);
    expect(levelForXp(100)).toMatchObject({ level: 3, floorXp: 100, nextXp: 225 });
    expect(levelForXp(160).progress).toBeCloseTo(60 / 125);
  });

  it("caps the title at the last one", () => {
    expect(levelForXp(1_000_000).title).toBe("Lab Legend");
  });
});

describe("quiz XP", () => {
  it("gives points per correct answer plus a perfect bonus", () => {
    expect(quizXp(3, 5)).toBe(12);
    expect(quizXp(5, 5)).toBe(5 * XP.quizPerCorrect + XP.quizPerfectBonus);
    expect(quizXp(0, 5)).toBe(0);
  });
});

describe("playerStats", () => {
  it("adds item XP, best quiz per item and this-week XP", () => {
    const progress = { a: { "rag-1": iso(13), "rag-3": iso(5), "p0-1": iso(13) } }; // rag-3 and p0-1 are build items
    const quizzes = [quiz({ id: "1", score: 2, completed_at: iso(6) }), quiz({ id: "2", score: 4, completed_at: iso(13) })];
    const s = playerStats("a", progress, quizzes, now);
    expect(s.itemsDone).toBe(3);
    expect(s.xp).toBe(10 + 30 + 30 + quizXp(4, 5));
    expect(s.weekXp).toBe(10 + 30 + quizXp(4, 5));
    expect(s.badges.has("first-step")).toBe(true);
    expect(s.badges.has("quiz-whiz")).toBe(false);
  });

  it("awards phase completion, hat trick and perfect-quiz badges", () => {
    const allRag = Object.fromEntries(PHASES[0].items.map((i) => [i.id, iso(13)]));
    const s = playerStats("a", { a: allRag }, [quiz({ score: 5 })], now);
    expect(s.phasesComplete).toEqual(["rag"]);
    expect(s.badges.has("rag-master")).toBe(true);
    expect(s.badges.has("phase-finisher")).toBe(true);
    expect(s.badges.has("hat-trick")).toBe(true);
    expect(s.badges.has("quiz-whiz")).toBe(true);
  });

  it("handles a player with nothing done", () => {
    const s = playerStats("nobody", {}, [], now);
    expect(s).toMatchObject({ xp: 0, weekXp: 0, itemsDone: 0, streak: 0 });
    expect(s.badges.size).toBe(0);
  });

  it("ignores items that are no longer on the roadmap", () => {
    expect(playerStats("a", { a: { "p0-6": iso(13) } }, [], now).xp).toBe(0);
  });
});

describe("ranking and quests", () => {
  it("ranks by XP, then by this week's XP", () => {
    const base = playerStats("x", {}, [], now);
    const ranked = rankPlayers([
      { ...base, userId: "a", xp: 50, weekXp: 0 },
      { ...base, userId: "b", xp: 80, weekXp: 0 },
      { ...base, userId: "c", xp: 50, weekXp: 20 },
    ]);
    expect(ranked.map((p) => p.userId)).toEqual(["b", "c", "a"]);
  });

  it("lists the next unfinished items from the current phase onward", () => {
    const quests = nextQuests(PHASES, "rag", { "rag-1": "x", "rag-2": "x" });
    expect(quests.map((q) => q.item.id)).toEqual(["rag-3", "rag-4", "rag-5"]);
  });
});
