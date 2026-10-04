import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Profile } from "../../supabase";
import type { PagesState } from "../../hooks/usePages";
import { displayTitle, MAX_TITLE, trackOf, TRACKS, type PageMeta } from "../../pages";
import { PHASES } from "../../roadmap";
import type { SaveStatus } from "./NoteEditor";

const NoteEditor = lazy(() => import("./NoteEditor"));

interface Props {
  readonly page: PageMeta;
  readonly author: Profile | undefined;
  readonly isMine: boolean;
  readonly pagesState: PagesState;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const STATUS_LABEL: Record<SaveStatus, string> = { saved: "Saved", saving: "Saving…", unsaved: "Unsaved changes", error: "Not saved" };

export function PageView({ page, author, isMine, pagesState }: Props) {
  const { loadContent, saveContent, updateMeta, remove, uploadImage } = pagesState;
  const [content, setContent] = useState<unknown[] | null>(null);
  const [title, setTitle] = useState(page.title);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [confirming, setConfirming] = useState(false);
  const titleTimer = useRef<number | undefined>(undefined);

  // Owners load once per page; readers reload when the author saves, so they see edits live.
  const contentKey = isMine ? page.id : `${page.id}:${page.updated_at}`;

  useEffect(() => {
    let active = true;
    setContent(null);
    loadContent(page.id).then((c) => active && setContent(c ?? []));
    return () => {
      active = false;
    };
  }, [contentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTitle(page.title);
    setConfirming(false);
  }, [page.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => window.clearTimeout(titleTimer.current), []);

  const onTitle = (value: string) => {
    setTitle(value);
    window.clearTimeout(titleTimer.current);
    titleTimer.current = window.setTimeout(() => void updateMeta(page.id, { title: value }), 600);
  };

  const onTrack = (trackId: string) => {
    const track_id = trackId || null;
    // Keep the linked item only if it belongs to the new track.
    const keepItem = page.item_id && track_id && page.item_id.startsWith(`${track_id}-`);
    void updateMeta(page.id, { track_id, item_id: keepItem ? page.item_id : null });
  };

  const phase = PHASES.find((p) => p.id === page.track_id);
  const linkedItem = phase?.items.find((i) => i.id === page.item_id);
  const name = author?.display_name || author?.github_username || "Someone";

  return (
    <article className="page-view">
      <div className="page-meta-row">
        <div className="page-author">
          {author?.avatar_url && <img src={author.avatar_url} alt="" width={22} height={22} />}
          <span>
            <b>{name}</b> · created {fmt(page.created_at)}
            {page.updated_at !== page.created_at && <> · edited {fmt(page.updated_at)}</>}
          </span>
        </div>
        {isMine && <span className={`save-status ${status}`} role="status">{STATUS_LABEL[status]}</span>}
      </div>

      {isMine ? (
        <input
          id="page-title"
          className="page-title-input"
          value={title}
          maxLength={MAX_TITLE}
          placeholder="Untitled"
          aria-label="Page title"
          onChange={(e) => onTitle(e.target.value)}
          onBlur={() => {
            window.clearTimeout(titleTimer.current);
            if (title !== page.title) void updateMeta(page.id, { title });
          }}
        />
      ) : (
        <h1 className="page-title">{displayTitle(page.title)}</h1>
      )}

      <div className="page-props">
        {isMine ? (
          <>
            <label>
              <span>Section</span>
              <select id="page-track" value={page.track_id ?? ""} onChange={(e) => onTrack(e.target.value)}>
                {TRACKS.map((t) => (
                  <option key={t.id ?? "general"} value={t.id ?? ""}>{t.short} · {t.title}</option>
                ))}
              </select>
            </label>
            {phase && (
              <label>
                <span>Roadmap item</span>
                <select id="page-item" value={page.item_id ?? ""} onChange={(e) => void updateMeta(page.id, { item_id: e.target.value || null })}>
                  <option value="">None</option>
                  {phase.items.map((i) => (
                    <option key={i.id} value={i.id}>{i.title}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="page-danger">
              {confirming ? (
                <>
                  <span className="muted">Delete this page for good?</span>
                  <button type="button" className="danger" onClick={() => remove(page.id).then((ok) => ok && (window.location.hash = "notes"))}>Delete</button>
                  <button type="button" className="ghost" onClick={() => setConfirming(false)}>Keep</button>
                </>
              ) : (
                <button type="button" className="ghost" onClick={() => setConfirming(true)}>Delete page</button>
              )}
            </div>
          </>
        ) : (
          <>
            <span className="tag">{trackOf(page).short} · {trackOf(page).title}</span>
            {linkedItem && <span className="tag">{linkedItem.title}</span>}
          </>
        )}
      </div>

      <div className="editor-wrap">
        {content === null ? (
          <p className="muted">Opening page…</p>
        ) : (
          <Suspense fallback={<p className="muted">Loading editor…</p>}>
            <NoteEditor
              key={contentKey}
              initialContent={content}
              editable={isMine}
              onSave={(c) => saveContent(page.id, c)}
              onStatus={setStatus}
              uploadFile={(file) => uploadImage(page.user_id, file)}
            />
          </Suspense>
        )}
      </div>
    </article>
  );
}
