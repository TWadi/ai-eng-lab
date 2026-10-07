import { describe, expect, it } from "vitest";
import { bestScores, buildFeed, relativeTime, weekStartOf, weekStats, type QuizResult } from "./activity";

const quiz = (over: Partial<QuizResult>): QuizResult => ({
  id: "q", user_id: "a", item_id: "rag-1", score: 3, total: 5, completed_at: "2026-10-05T10:00:00Z", ...over,
});

describe("buildFeed", () => {
  it("merges ticks and quizzes newest first", () => {
    const feed = buildFeed(
      { a: { "rag-1": "2026-10-04T10:00:00Z" }, b: { "rag-2": "2026-10-04T12:00:00Z" } },
      [quiz({ completed_at: "2026-10-04T11:00:00Z" })],
    );
    expect(feed.map((e) => `${e.kind}:${e.userId}:${e.itemId}`)).toEqual(["done:b:rag-2", "quiz:a:rag-1", "done:a:rag-1"]);
  });

  it("skips items that left the roadmap and respects the limit", () => {
    const feed = buildFeed({ a: { "p0-6": "2026-10-04T10:00:00Z", "rag-1": "2026-10-04T09:00:00Z", "rag-2": "2026-10-04T08:00:00Z" } }, [], 1);
    expect(feed).toHaveLength(1);
    expect(feed[0].itemId).toBe("rag-1");
  });
});

describe("weeks and streaks", () => {
  it("finds Monday of the week", () => {
    expect(weekStartOf(new Date(2026, 9, 4)).getDay()).toBe(1); // Sunday 4 Oct -> Monday 28 Sep
    expect(weekStartOf(new Date(2026, 9, 4)).getDate()).toBe(28);
    expect(weekStartOf(new Date(2026, 9, 5)).getDate()).toBe(5); // a Monday maps to itself
  });

  const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();
  const now = new Date(2026, 9, 14, 12); // Wednesday 14 Oct

  it("counts this week and a streak that includes it", () => {
    const s = weekStats([at(2026, 9, 13), at(2026, 9, 6), at(2026, 8, 30)], now);
    expect(s.thisWeek).toBe(1);
    expect(s.streak).toBe(3);
  });

  it("keeps last week's streak alive while this week is still empty", () => {
    expect(weekStats([at(2026, 9, 6), at(2026, 8, 30)], now)).toEqual({ thisWeek: 0, streak: 2 });
  });

  it("breaks on a missed week", () => {
    expect(weekStats([at(2026, 9, 13), at(2026, 8, 23)], now).streak).toBe(1);
    expect(weekStats([], now)).toEqual({ thisWeek: 0, streak: 0 });
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  it("formats recent times", () => {
    expect(relativeTime("2026-10-04T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-10-04T11:30:00Z", now)).toBe("30 min ago");
    expect(relativeTime("2026-10-04T09:00:00Z", now)).toBe("3 h ago");
    expect(relativeTime("2026-10-03T09:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-10-01T09:00:00Z", now)).toBe("3 days ago");
  });
});

describe("bestScores", () => {
  it("keeps the best attempt per person for an item", () => {
    const best = bestScores([quiz({ id: "1", score: 2 }), quiz({ id: "2", score: 4 }), quiz({ id: "3", user_id: "b", score: 5 }), quiz({ id: "4", item_id: "rag-2", score: 5 })], "rag-1");
    expect(best.a.id).toBe("2");
    expect(best.b.score).toBe(5);
    expect(Object.keys(best)).toHaveLength(2);
  });
});

describe("quizzes from duels", () => {
  it("count for best scores but don't repeat the duel in the feed", () => {
    const fromDuel = quiz({ id: "d", score: 5, source_duel: "duel-1" });
    expect(buildFeed({}, [fromDuel], 10).filter((e) => e.kind === "quiz")).toEqual([]);
    expect(bestScores([quiz({ id: "s", score: 2 }), fromDuel], "rag-1").a?.score).toBe(5);
  });
});
