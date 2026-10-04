import { describe, expect, it } from "vitest";
import {
  checkImage, cleanTitle, displayTitle, groupByTrack, imageExtension, pageIdFromHash, removePage, trackOf, upsertPage,
  TRACKS, type PageMeta,
} from "./pages";

const page = (over: Partial<PageMeta>): PageMeta => ({
  id: "1", user_id: "a", track_id: null, item_id: null, title: "", created_at: "2026-10-04T10:00:00Z",
  updated_at: "2026-10-04T10:00:00Z", ...over,
});

describe("titles", () => {
  it("shows Untitled for blank titles", () => {
    expect(displayTitle("  ")).toBe("Untitled");
    expect(displayTitle("Embeddings")).toBe("Embeddings");
  });

  it("collapses whitespace and caps length", () => {
    expect(cleanTitle("  RAG\n  basics ")).toBe("RAG basics");
    expect(cleanTitle("x".repeat(300))).toHaveLength(200);
  });
});

describe("tracks and grouping", () => {
  it("lists the RAG course first and General last", () => {
    expect(TRACKS[0].id).toBe("rag");
    expect(TRACKS[TRACKS.length - 1].title).toBe("General");
  });

  it("puts unknown or missing tracks under General", () => {
    expect(trackOf({ track_id: null }).title).toBe("General");
    expect(trackOf({ track_id: "zzz" }).title).toBe("General");
    expect(trackOf({ track_id: "rag" }).short).toBe("RAG");
  });

  it("groups pages by track, oldest first, optionally by author", () => {
    const pages = [
      page({ id: "2", track_id: "rag", user_id: "b", created_at: "2026-10-04T12:00:00Z" }),
      page({ id: "1", track_id: "rag", user_id: "a", created_at: "2026-10-04T11:00:00Z" }),
      page({ id: "3", track_id: null, user_id: "a" }),
      page({ id: "4", track_id: "gone", user_id: "a" }),
    ];
    const groups = groupByTrack(pages);
    expect(groups.find((g) => g.track.id === "rag")?.pages.map((p) => p.id)).toEqual(["1", "2"]);
    expect(groups.find((g) => g.track.id === null)?.pages.map((p) => p.id)).toEqual(["3", "4"]);
    expect(groupByTrack(pages, "b").flatMap((g) => g.pages).map((p) => p.id)).toEqual(["2"]);
  });

  it("upserts and removes without mutating", () => {
    const pages = [page({ id: "1" })];
    expect(upsertPage(pages, page({ id: "1", title: "new" }))[0].title).toBe("new");
    expect(upsertPage(pages, page({ id: "2" }))).toHaveLength(2);
    expect(removePage(pages, "1")).toHaveLength(0);
    expect(pages).toHaveLength(1);
  });
});

describe("routing", () => {
  it("reads a page id from the hash", () => {
    expect(pageIdFromHash("#notes/0b8e8f8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b")).toBe("0b8e8f8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b");
    expect(pageIdFromHash("#notes")).toBeNull();
    expect(pageIdFromHash("#notes/not-an-id")).toBeNull();
  });
});

describe("images", () => {
  it("accepts small common images", () => {
    expect(checkImage({ type: "image/png", size: 1000 }).ok).toBe(true);
  });

  it("rejects other types and big files", () => {
    expect(checkImage({ type: "image/svg+xml", size: 10 }).ok).toBe(false);
    expect(checkImage({ type: "application/pdf", size: 10 }).ok).toBe(false);
    expect(checkImage({ type: "image/jpeg", size: 6 * 1024 * 1024 }).ok).toBe(false);
  });

  it("maps types to extensions", () => {
    expect(imageExtension("image/jpeg")).toBe("jpg");
    expect(imageExtension("image/webp")).toBe("webp");
  });
});
