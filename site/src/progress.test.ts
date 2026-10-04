import { describe, expect, it } from "vitest";
import {
  countDone, groupByUser, percent, phaseForWeek, weekNumber, weekStart, withItem, withoutItem,
} from "./progress";
import { ALL_ITEM_IDS, PHASES, START_DATE } from "./roadmap";

describe("groupByUser", () => {
  it("groups rows per user", () => {
    const rows = [
      { user_id: "a", item_id: "p0-1", done_at: "t1" },
      { user_id: "a", item_id: "p0-2", done_at: "t2" },
      { user_id: "b", item_id: "p0-1", done_at: "t3" },
    ];
    expect(groupByUser(rows)).toEqual({ a: { "p0-1": "t1", "p0-2": "t2" }, b: { "p0-1": "t3" } });
  });

  it("returns an empty object for no rows", () => {
    expect(groupByUser([])).toEqual({});
  });
});

describe("withItem / withoutItem", () => {
  it("adds without mutating the original", () => {
    const before = { a: { "p0-1": "t1" } };
    const after = withItem(before, "a", "p0-2", "t2");
    expect(after).toEqual({ a: { "p0-1": "t1", "p0-2": "t2" } });
    expect(before).toEqual({ a: { "p0-1": "t1" } });
  });

  it("adds for a user with no progress yet", () => {
    expect(withItem({}, "b", "p0-1", "t")).toEqual({ b: { "p0-1": "t" } });
  });

  it("removes without mutating the original", () => {
    const before = { a: { "p0-1": "t1", "p0-2": "t2" } };
    expect(withoutItem(before, "a", "p0-1")).toEqual({ a: { "p0-2": "t2" } });
    expect(before.a).toHaveProperty("p0-1");
  });

  it("removing from an unknown user is harmless", () => {
    expect(withoutItem({}, "x", "p0-1")).toEqual({ x: {} });
  });
});

describe("countDone and percent", () => {
  it("ignores ids that are not on the roadmap", () => {
    expect(countDone({ "p0-1": "t", "old-item": "t" }, ["p0-1", "p0-2"])).toBe(1);
  });

  it("handles undefined", () => {
    expect(countDone(undefined, ALL_ITEM_IDS)).toBe(0);
  });

  it("rounds and guards against zero", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
  });
});

describe("weeks and phases", () => {
  it("week 1 starts on the start date", () => {
    expect(weekNumber(START_DATE, START_DATE)).toBe(1);
    expect(weekNumber(START_DATE, new Date("2026-10-18T23:00:00"))).toBe(1);
    expect(weekNumber(START_DATE, new Date("2026-10-19T00:00:00"))).toBe(2);
  });

  it("is zero or negative before the start", () => {
    expect(weekNumber(START_DATE, new Date("2026-10-05T00:00:00"))).toBe(0);
  });

  it("weekStart inverts weekNumber", () => {
    expect(weekNumber(START_DATE, weekStart(START_DATE, 12))).toBe(12);
  });

  it("maps weeks to phases", () => {
    expect(phaseForWeek(PHASES, 0)?.id).toBe("p0");
    expect(phaseForWeek(PHASES, 1)?.id).toBe("p0");
    expect(phaseForWeek(PHASES, 11)?.id).toBe("p3");
    expect(phaseForWeek(PHASES, 40)?.id).toBe("p7");
    expect(phaseForWeek(PHASES, 41)).toBeUndefined();
  });

  it("phases cover weeks 1-40 with no gaps or overlaps", () => {
    const weeks = PHASES.flatMap((p) => Array.from({ length: p.weeks[1] - p.weeks[0] + 1 }, (_, i) => p.weeks[0] + i));
    expect(weeks).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it("item ids are unique and match the database format", () => {
    expect(new Set(ALL_ITEM_IDS).size).toBe(ALL_ITEM_IDS.length);
    ALL_ITEM_IDS.forEach((id) => expect(id).toMatch(/^p[0-9]-[0-9]{1,2}$/));
  });
});
