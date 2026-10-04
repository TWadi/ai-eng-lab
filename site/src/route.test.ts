import { describe, expect, it } from "vitest";
import { href, parseRoute } from "./route";

describe("parseRoute", () => {
  it("defaults to the dashboard", () => {
    expect(parseRoute("")).toEqual({ page: "dashboard" });
    expect(parseRoute("#/")).toEqual({ page: "dashboard" });
    expect(parseRoute("#/nonsense")).toEqual({ page: "dashboard" });
  });

  it("reads pages and phases", () => {
    expect(parseRoute("#/activity")).toEqual({ page: "activity" });
    expect(parseRoute("#/roadmap")).toEqual({ page: "roadmap", phase: undefined });
    expect(parseRoute("#/roadmap/p3")).toEqual({ page: "roadmap", phase: "p3" });
    expect(parseRoute("#/roadmap/zzz")).toEqual({ page: "roadmap", phase: undefined });
  });

  it("reads player pages and rejects bad names", () => {
    expect(parseRoute("#/player/TWadi")).toEqual({ page: "player", player: "TWadi" });
    expect(parseRoute("#/player/bad%20name")).toEqual({ page: "dashboard" });
    expect(parseRoute("#/player/")).toEqual({ page: "dashboard" });
    expect(href({ page: "player", player: "bravo421" })).toBe("#/player/bravo421");
  });

  it("keeps old phase links working", () => {
    expect(parseRoute("#rag")).toEqual({ page: "roadmap", phase: "rag" });
    expect(parseRoute("#p4")).toEqual({ page: "roadmap", phase: "p4" });
  });

  it("round-trips through href", () => {
    for (const r of [{ page: "dashboard" as const }, { page: "activity" as const }, { page: "roadmap" as const, phase: "p2" }]) {
      expect(parseRoute(href(r))).toMatchObject(r);
    }
  });
});
