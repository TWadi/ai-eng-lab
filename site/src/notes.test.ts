import { describe, expect, it } from "vitest";
import { filterNotes, linkify, phaseOfItem, removeNote, sortNewestFirst, upsertNote, validateNote, type Note } from "./notes";

const note = (over: Partial<Note>): Note => ({
  id: "n1", user_id: "a", title: "t", body: "b", source_url: null, item_id: null,
  created_at: "2026-10-04T10:00:00Z", updated_at: "2026-10-04T10:00:00Z", ...over,
});

const raw = (over: Partial<{ title: string; body: string; source_url: string; item_id: string }> = {}) => ({
  title: "Embeddings", body: "Vectors that capture meaning", source_url: "", item_id: "", ...over,
});

describe("validateNote", () => {
  it("accepts a minimal note and trims it", () => {
    expect(validateNote(raw({ title: "  Embeddings  " }))).toEqual({
      ok: true, value: { title: "Embeddings", body: "Vectors that capture meaning", source_url: null, item_id: null },
    });
  });

  it("keeps a valid link and roadmap item", () => {
    const r = validateNote(raw({ source_url: "https://youtu.be/x", item_id: "p4-8" }));
    expect(r.ok && r.value.source_url).toBe("https://youtu.be/x");
    expect(r.ok && r.value.item_id).toBe("p4-8");
  });

  it("rejects missing title or body", () => {
    expect(validateNote(raw({ title: " " })).ok).toBe(false);
    expect(validateNote(raw({ body: "" })).ok).toBe(false);
  });

  it("rejects overlong fields", () => {
    expect(validateNote(raw({ title: "x".repeat(201) })).ok).toBe(false);
    expect(validateNote(raw({ body: "x".repeat(20001) })).ok).toBe(false);
  });

  it("rejects links that are not http(s)", () => {
    expect(validateNote(raw({ source_url: "javascript:alert(1)" })).ok).toBe(false);
    expect(validateNote(raw({ source_url: "youtube.com" })).ok).toBe(false);
  });

  it("rejects unknown roadmap items", () => {
    expect(validateNote(raw({ item_id: "p9-99" })).ok).toBe(false);
  });
});

describe("filtering and ordering", () => {
  const notes = [
    note({ id: "1", user_id: "a", item_id: "p4-8", created_at: "2026-10-01T00:00:00Z" }),
    note({ id: "2", user_id: "b", item_id: "rag-2", created_at: "2026-10-03T00:00:00Z" }),
    note({ id: "3", user_id: "a", item_id: null, created_at: "2026-10-02T00:00:00Z" }),
  ];

  it("maps items to phases", () => {
    expect(phaseOfItem("p4-8")).toBe("p4");
    expect(phaseOfItem(null)).toBeNull();
  });

  it("filters by person and phase", () => {
    expect(filterNotes(notes, { userId: "a", phaseId: null }).map((n) => n.id)).toEqual(["1", "3"]);
    expect(filterNotes(notes, { userId: null, phaseId: "rag" }).map((n) => n.id)).toEqual(["2"]);
    expect(filterNotes(notes, { userId: null, phaseId: null })).toHaveLength(3);
  });

  it("sorts newest first without mutating", () => {
    expect(sortNewestFirst(notes).map((n) => n.id)).toEqual(["2", "3", "1"]);
    expect(notes[0].id).toBe("1");
  });

  it("upserts and removes", () => {
    const added = upsertNote(notes, note({ id: "4", created_at: "2026-10-05T00:00:00Z" }));
    expect(added[0].id).toBe("4");
    const edited = upsertNote(added, note({ id: "4", title: "new", created_at: "2026-10-05T00:00:00Z" }));
    expect(edited).toHaveLength(4);
    expect(edited[0].title).toBe("new");
    expect(removeNote(edited, "4")).toHaveLength(3);
  });
});

describe("linkify", () => {
  it("splits links out of text and drops trailing punctuation", () => {
    expect(linkify("See https://x.dev/a. Nice")).toEqual([
      { text: "See " }, { text: "https://x.dev/a", href: "https://x.dev/a" }, { text: ". Nice" },
    ]);
  });

  it("leaves text without links alone", () => {
    expect(linkify("plain text")).toEqual([{ text: "plain text" }]);
  });
});
