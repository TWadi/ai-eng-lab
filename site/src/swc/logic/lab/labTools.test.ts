import { describe, expect, it } from "vitest";
import { CHALLENGES } from "./challenges";
import { ragMessages } from "./llm";
import { charsPerToken, showWhitespace, TOKENIZERS } from "./tokenizer";

describe("ragMessages", () => {
  it("numbers the chunks as context and asks to cite them", () => {
    const [system, user] = ragMessages("  What is RAG? ", ["Chunk one. ", "Chunk two."]);
    expect(system.role).toBe("system");
    expect(system.content).toMatch(/only the context/);
    expect(user.content).toBe("Context:\n[1] Chunk one.\n\n[2] Chunk two.\n\nQuestion: What is RAG?");
  });
});

describe("tokenizer helpers", () => {
  it("makes whitespace visible", () => {
    expect(showWhitespace(" a\tb\n")).toBe("·a→b↵");
  });

  it("counts characters (not UTF-16 units) per token", () => {
    expect(charsPerToken("hello", 2)).toBe(2.5);
    expect(charsPerToken("🙂🙂", 1)).toBe(2);
    expect(charsPerToken("abc", 0)).toBe(0);
  });

  it("lists each tokenizer once", () => {
    expect(new Set(TOKENIZERS.map((t) => t.id)).size).toBe(TOKENIZERS.length);
  });
});

describe("lab routes", () => {
  it("never gives a challenge the id of a Lab tab", () => {
    const tabs = ["playground", "tokenizer", "scratchpad"];
    expect(CHALLENGES.filter((c) => tabs.includes(c.id))).toEqual([]);
  });
});

describe("race challenges", () => {
  it("lists every challenge in the database so races can pick it", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = new URL("../../../../../supabase/migrations/", import.meta.url);
    const sql = readdirSync(dir).map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");
    const listed = new Set(
      [...sql.matchAll(/insert into public\.(?:race_)?challenges \(id\) values([\s\S]*?);/g)]
        .flatMap((m) => [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1])),
    );
    expect(CHALLENGES.map((c) => c.id).filter((id) => !listed.has(id))).toEqual([]);
  });
});
