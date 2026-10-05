import { describe, expect, it } from "vitest";
import { activeDuel, duelLimitMs, duelRecord, duelXp, formatTime, viewDuel, type Duel } from "./duels";
import { buildFeed, duelTitle } from "./activity";
import { CHALLENGES } from "./lab/challenges";
import { playerStats, xpTimeline } from "./gamify";

const now = new Date("2026-10-14T12:00:00Z");
const duel = (over: Partial<Duel>): Duel => ({
  id: "d1", kind: "quiz", item_id: "rag-1", challenge_id: null, challenger: "a", opponent: "b", status: "pending", winner: null,
  created_at: "2026-10-14T11:58:00Z", completed_at: null, starts_at: null, ...over,
});

describe("viewDuel", () => {
  it("shows a pending challenge as incoming or outgoing", () => {
    expect(viewDuel(duel({}), [], "b", now).state).toBe("invite-in");
    expect(viewDuel(duel({}), [], "a", now)).toMatchObject({ state: "invite-out", rivalId: "b" });
    expect(viewDuel(duel({}), [], "c", now).state).toBe("watching");
  });

  it("expires invites after five minutes", () => {
    expect(viewDuel(duel({ created_at: "2026-10-14T11:50:00Z" }), [], "b", now).state).toBe("expired");
  });

  it("is live for both players once accepted", () => {
    const d = duel({ status: "live", starts_at: "2026-10-14T11:59:00Z" });
    expect(viewDuel(d, [], "a", now).state).toBe("live");
    expect(viewDuel(d, [], "b", now).state).toBe("live");
  });

  it("shows the result from each side, and closed states as-is", () => {
    const d = duel({ status: "done", winner: "a", completed_at: "2026-10-14T11:59:30Z" });
    expect(viewDuel(d, [], "a", now).state).toBe("won");
    expect(viewDuel(d, [], "b", now).state).toBe("lost");
    expect(viewDuel(duel({ status: "done", winner: null }), [], "a", now).state).toBe("draw");
    expect(viewDuel(duel({ status: "declined" }), [], "a", now).state).toBe("declined");
    expect(viewDuel(duel({ status: "cancelled" }), [], "b", now).state).toBe("cancelled");
  });
});

describe("activeDuel", () => {
  it("prefers live, then incoming, then outgoing", () => {
    const out = duel({ id: "1", challenger: "me", opponent: "x" });
    const inc = duel({ id: "2", challenger: "y", opponent: "me" });
    const live = duel({ id: "3", challenger: "me", opponent: "z", status: "live" });
    expect(activeDuel([out, inc, live], [], "me", now)?.duel.id).toBe("3");
    expect(activeDuel([out, inc], [], "me", now)?.duel.id).toBe("2");
    expect(activeDuel([out], [], "me", now)?.duel.id).toBe("1");
    expect(activeDuel([out], [], null, now)).toBeUndefined();
  });
});

describe("records and XP", () => {
  const duels = [
    duel({ id: "1", status: "done", winner: "a", completed_at: "2026-10-13T14:00:00Z" }),
    duel({ id: "2", status: "done", winner: "b", completed_at: "2026-10-13T15:00:00Z" }),
    duel({ id: "3", status: "done", winner: null, completed_at: "2026-10-13T16:00:00Z" }),
    duel({ id: "4", status: "declined" }),
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

describe("code races", () => {
  const race = (over: Partial<Duel>): Duel => duel({ kind: "code", item_id: null, ...over });
  const challenge = CHALLENGES[0];

  it("get 15 minutes instead of 2", () => {
    expect(duelLimitMs(race({}))).toBe(15 * 60_000);
    expect(duelLimitMs(duel({}))).toBe(120_000);
  });

  it("keep the challenge a mystery until it's revealed", () => {
    expect(duelTitle(race({}))).toBe("Code race (mystery challenge)");
    expect(duelTitle(race({ challenge_id: challenge.id }))).toBe(`Code race: ${challenge.title}`);
    expect(duelTitle(duel({}))).not.toMatch(/race/i);
  });

  it("count as wins and give the speed-coder badge", () => {
    const won = race({ status: "done", winner: "a", challenge_id: challenge.id, completed_at: "2026-10-14T11:59:30Z" });
    expect(duelXp("a", won)).toBe(15);
    const stats = playerStats("a", {}, [], now, [won]);
    expect(stats.duelWins).toBe(1);
    expect(stats.badges.has("speed-coder")).toBe(true);
    expect(playerStats("b", {}, [], now, [won]).badges.has("speed-coder")).toBe(false);
  });

  it("show in the feed under the challenge, without a quiz score", () => {
    const won = race({ status: "done", winner: "b", challenge_id: challenge.id, completed_at: "2026-10-14T11:59:30Z" });
    const [event] = buildFeed({}, [], 10, [won], []);
    expect(event).toMatchObject({ kind: "duel", userId: "b", rivalId: "a", itemId: challenge.item, challengeId: challenge.id, score: null });
  });
});
