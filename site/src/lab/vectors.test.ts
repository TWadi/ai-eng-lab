import { describe, expect, it } from "vitest";
import { chunkText, cosine, pca2d, rank } from "./vectors";
import { CHALLENGES, allPassed } from "./challenges";

describe("cosine", () => {
  it("handles the basic cases", () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("chunkText", () => {
  it("matches the challenge's rules", () => {
    expect(chunkText("abcdefghij", 4, 1)).toEqual(["abcd", "defg", "ghij"]);
    expect(chunkText("", 4, 1)).toEqual([]);
    expect(() => chunkText("abc", 3, 3)).toThrow();
  });
});

describe("rank", () => {
  it("sorts by similarity with ties to the lower index", () => {
    expect(rank([1, 0], [[0, 1], [2, 0], [1, 0]]).map((r) => r.index)).toEqual([1, 2, 0]);
  });
});

describe("pca2d", () => {
  it("separates two clusters along the first axis", () => {
    const pts = pca2d([[1, 0, 0], [0.9, 0.1, 0], [0, 0, 1], [0, 0.1, 0.9]]);
    expect(pts).toHaveLength(4);
    const [a, b, c, d] = pts.map((p) => p[0]);
    expect(Math.sign(a)).toBe(Math.sign(b));
    expect(Math.sign(c)).toBe(Math.sign(d));
    expect(Math.sign(a)).not.toBe(Math.sign(c));
  });

  it("handles tiny inputs", () => {
    expect(pca2d([])).toEqual([]);
    expect(pca2d([[1, 2]])).toEqual([[0, 0]]);
  });
});

describe("challenge data", () => {
  it("has unique ids, valid levels and some visible tests", () => {
    const ids = CHALLENGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CHALLENGES) {
      expect(["easy", "medium", "hard"]).toContain(c.level);
      expect(c.tests.some((t) => !t.hidden)).toBe(true);
      expect(c.starter.length).toBeGreaterThan(10);
    }
  });

  it("only counts a run as passed when every test passes", () => {
    expect(allPassed({ error: null, stdout: "", results: [{ name: "a", ok: true, message: "" }] })).toBe(true);
    expect(allPassed({ error: null, stdout: "", results: [] })).toBe(false);
    expect(allPassed({ error: "boom", stdout: "", results: [{ name: "a", ok: true, message: "" }] })).toBe(false);
  });
});
