import { describe, expect, it } from "vitest";
import { availableCards, buildCard, cardLabel, SITE_URL } from "./share";
import { playerStats } from "./gamify";
import { PHASES } from "./roadmap";

const now = new Date(2026, 9, 14, 12);
const allRag = Object.fromEntries(PHASES[0].items.map((i) => [i.id, new Date(2026, 9, 13, 10).toISOString()]));
const stats = playerStats("a", { a: allRag }, [{ id: "q", user_id: "a", item_id: "rag-1", score: 5, total: 5, completed_at: new Date(2026, 9, 13).toISOString() }], now);
const input = { name: "Wadi", handle: "TWadi", stats, record: { wins: 2, losses: 1, draws: 0 } };

describe("availableCards", () => {
  it("offers the overall card plus one per badge and cleared phase", () => {
    const cards = availableCards(stats);
    expect(cards[0]).toEqual({ type: "overall" });
    expect(cards).toContainEqual({ type: "badge", id: "rag-master" });
    expect(cards).toContainEqual({ type: "badge", id: "quiz-whiz" });
    expect(cards).toContainEqual({ type: "phase", id: "rag" });
  });

  it("offers only the overall card to a new player", () => {
    expect(availableCards(playerStats("x", {}, [], now))).toEqual([{ type: "overall" }]);
  });

  it("labels cards for the picker", () => {
    expect(cardLabel({ type: "overall" })).toBe("My progress");
    expect(cardLabel({ type: "badge", id: "quiz-whiz" })).toBe("Badge: Quiz Whiz");
    expect(cardLabel({ type: "phase", id: "rag" })).toBe("Phase: RAG course (Harish Neel)");
  });
});

describe("buildCard", () => {
  it("builds the overall card with level, stats and a caption", () => {
    const c = buildCard({ type: "overall" }, input);
    expect(c.headline).toBe(`Level ${stats.level.level} · ${stats.level.title}`);
    expect(c.stats.map((s) => s.label)).toEqual(["XP", "Quests", "Streak", "Duel wins"]);
    expect(c.stats.find((s) => s.label === "Duel wins")?.value).toBe("2");
    expect(c.caption).toContain(SITE_URL);
    expect(c.caption).toContain("2 duel wins");
    expect(c.fileName).toMatch(/^ai-engineering-arena-twadi-level-\d+\.png$/);
  });

  it("features the badge on a badge card", () => {
    const c = buildCard({ type: "badge", id: "quiz-whiz" }, input);
    expect(c).toMatchObject({ eyebrow: "Badge unlocked", headline: "Quiz Whiz", featuredBadge: "quiz-whiz" });
    expect(c.caption).toContain('"Quiz Whiz"');
    expect(c.fileName).toBe("ai-engineering-arena-twadi-badge-quiz-whiz.png");
  });

  it("describes the phase on a phase card", () => {
    const c = buildCard({ type: "phase", id: "rag" }, input);
    expect(c.eyebrow).toBe("Phase cleared");
    expect(c.headline).toBe("RAG course (Harish Neel)");
    expect(c.stats[0]).toEqual({ label: "Quests", value: "17" });
    expect(c.caption).toContain("Phase cleared: RAG course");
  });
});
