// @vitest-environment jsdom
// The RTE makes hooks testable without a database: wire fake ports, drive them, check the state.
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { fail, ok, type ChallengeSolve } from "../swc/logic/types";
import type { ProgressRow } from "../swc/logic/progress";
import type { Rte } from "./ports";
import { RteProvider } from "./RteContext";
import { useProgress } from "./useProgress";
import { useSolves } from "./useSolves";

/** A fake Rte: only the ports a test touches need real behavior. */
function fakeRte(overrides: Partial<Rte>): Rte {
  const unused = new Proxy({}, { get: () => () => { throw new Error("port not faked in this test"); } });
  return { configured: true, ...(Object.fromEntries(
    ["auth", "progress", "quizzes", "duels", "live", "players", "solves", "python", "kernel", "embedder", "tokenizer", "llm"]
      .map((k) => [k, unused]),
  ) as unknown as Omit<Rte, "configured">), ...overrides };
}

const wrapper = (rte: Rte) => ({ children }: { children: ReactNode }) => <RteProvider rte={rte}>{children}</RteProvider>;

describe("useSolves through the SolvesPort", () => {
  it("loads, merges pushed solves without duplicates, and records", async () => {
    let push: (s: ChallengeSolve) => void = () => undefined;
    const recorded: string[] = [];
    const rte = fakeRte({
      solves: {
        load: async () => ok([{ user_id: "a", challenge_id: "bm25", solved_at: "t1" }]),
        watch: (cb) => { push = cb; return () => undefined; },
        record: async (_u, c) => { recorded.push(c); return ok(null); },
      },
    });
    const { result } = renderHook(() => useSolves(), { wrapper: wrapper(rte) });
    await waitFor(() => expect(result.current.solves).toHaveLength(1));

    act(() => push({ user_id: "a", challenge_id: "bm25", solved_at: "t1" }));
    act(() => push({ user_id: "b", challenge_id: "rrf", solved_at: "t2" }));
    expect(result.current.solves.map((s) => s.challenge_id)).toEqual(["bm25", "rrf"]);

    await act(async () => { await result.current.record("a", "mmr"); });
    expect(recorded).toEqual(["mmr"]);
    expect(result.current.solves.some((s) => s.challenge_id === "mmr")).toBe(true);
  });
});

describe("useProgress through the ProgressPort", () => {
  it("marks done optimistically and rolls back with the port's message on failure", async () => {
    const rows: ProgressRow[] = [];
    const rte = fakeRte({
      progress: {
        loadMembers: async () => ok([]),
        loadProgress: async () => ok(rows),
        watchProgress: () => () => undefined,
        watchMembers: () => () => undefined,
        markDone: async (_u, item) => (item === "rag-1" ? ok(null) : fail("Pass the quiz first")),
      },
    });
    const { result } = renderHook(() => useProgress(), { wrapper: wrapper(rte) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.markDone("u", "rag-1"); });
    expect("rag-1" in (result.current.progress.u ?? {})).toBe(true);

    await act(async () => { await result.current.markDone("u", "rag-2"); });
    expect("rag-2" in (result.current.progress.u ?? {})).toBe(false);
    expect(result.current.error).toBe("Pass the quiz first");
  });
});
