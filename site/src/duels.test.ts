import { describe, expect, it } from "vitest";
import { duelRecord, duelXp, formatTime, viewDuel, type Duel, type DuelEntry } from "./duels";
import { playerStats, xpTimeline } from "./gamify";

const now = new Date("2026-10-14T12:00:00Z");
const duel = (over: Partial<Duel>): Duel => ({
  id: "d1", item_id: "rag-1", challenger: "a", opponent: "b", status: "open", winner: null,
  created_at: "2026-10-13T12:00:00Z", completed_at: null, ...over,
});
const entry = (over: Partial<DuelEntry>): DuelEntry => ({
  duel_id: "d1", user_id: "a", started_at: "2026-10-13T12:00:00Z", submitted_at: null, score: null, time_ms: null, ...over,
});

describe("viewDuel", () => {
  it("is my turn until I submit, then I wait", () => {
    expect(viewDuel(duel({}), [], "b", now).state).toBe("your-turn");
    const played = [entry({ user_id: "b", submitted_at: "2026-10-13T13:00:00Z", score: 4 })];
    expect(viewDuel(duel({}), played, "b", now)).toMatchObject({ state: "waiting", rivalId: "a" });
  });

  it("shows the result from each side", () => {
    const d = duel({ status: "done", winner: "a", completed_at: "2026-10-13T14:00:00Z" });
    expect(viewDuel(d, [], "a", now).state).toBe("won");
    expect(viewDuel(d, [], "b", now).state).toBe("lost");
    expect(viewDuel(duel({ status: "done", winner: null }), [], "a", now).state).toBe("draw");
    expect(viewDuel(d, [], "someone-else", now).state).toBe("watching");
  });

  it("expires open duels after a week", () => {
    expect(viewDuel(duel({ created_at: "2026-10-01T12:00:00Z" }), [], "b", now).state).toBe("expired");
  });
});

describe("records and XP", () => {
  const duels = [
    duel({ id: "1", status: "done", winner: "a", completed_at: "2026-10-13T14:00:00Z" }),
    duel({ id: "2", status: "done", winner: "b", completed_at: "2026-10-13T15:00:00Z" }),
    duel({ id: "3", status: "done", winner: null, completed_at: "2026-10-13T16:00:00Z" }),
    duel({ id: "4" }),
  ];

  it("counts wins, losses and draws", () => {
    expect(duelRecord("a", duels)).toEqual({ wins: 1, losses: 1, draws: 1 });
    expect(duelRecord("z", duels)).toEqual({ wins: 0, losses: 0, draws: 0 });
  });

  it("gives XP for wins and draws only", () => {
    expect(duels.map((d) => duelXp("a", d))).toEqual([15, 0, 5, 0]);
  });

  it("adds duel XP and the Duelist badge to player stats", () => {
    const s = playerStats("a", {}, [], now, duels);
    expect(s.xp).toBe(20);
    expect(s.duelWins).toBe(1);
    expect(s.badges.has("duelist")).toBe(true);
  });

  it("formats times", () => {
    expect(formatTime(12345)).toBe("12.3s");
    expect(formatTime(null)).toBe("—");
  });
});

describe("xpTimeline", () => {
  it("accumulates by day and ends at the player's total", () => {
    const progress = { a: { "rag-1": "2026-10-12T09:00:00Z", "rag-2": "2026-10-12T10:00:00Z", "rag-3": "2026-10-13T09:00:00Z" } };
    const quizzes = [
      { id: "q1", user_id: "a", item_id: "rag-1", score: 3, total: 5, completed_at: "2026-10-12T11:00:00Z" },
      { id: "q2", user_id: "a", item_id: "rag-1", score: 5, total: 5, completed_at: "2026-10-13T11:00:00Z" },
      { id: "q3", user_id: "a", item_id: "rag-1", score: 2, total: 5, completed_at: "2026-10-13T12:00:00Z" },
    ];
    const line = xpTimeline("a", progress, quizzes);
    expect(line).toHaveLength(2);
    expect(line[0].xp).toBe(10 + 10 + 12);
    expect(line.at(-1)!.xp).toBe(playerStats("a", progress, quizzes, now).xp);
  });

  it("is empty for a new player", () => {
    expect(xpTimeline("nobody", {}, [])).toEqual([]);
  });
});
