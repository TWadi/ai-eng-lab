import { useEffect, useState } from "react";
import type { Profile } from "../../supabase";
import type { PagesState } from "../../hooks/usePages";
import { pageIdFromHash } from "../../pages";
import { PageSidebar } from "./PageSidebar";
import { PageView } from "./PageView";

interface Props {
  readonly pagesState: PagesState;
  readonly members: readonly Profile[];
  readonly me: Profile | null;
}

function useSelectedPageId(): string | null {
  const [id, setId] = useState(() => pageIdFromHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setId(pageIdFromHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return id;
}

export function NotesWorkspace({ pagesState, members, me }: Props) {
  const { pages, loading, error, create } = pagesState;
  const selectedId = useSelectedPageId();
  const selected = pages.find((p) => p.id === selectedId);
  const canCreate = Boolean(me?.is_member);

  const onCreate = async (trackId: string | null) => {
    const id = await create(trackId);
    if (id) window.location.hash = `notes/${id}`;
  };

  return (
    <div className="notes-workspace">
      <PageSidebar pages={pages} members={members} selectedId={selectedId} canCreate={canCreate} onCreate={onCreate} />

      <div className="page-pane">
        {error && <p className="banner error" role="alert">{error}</p>}
        {loading ? (
          <p className="muted">Loading notes…</p>
        ) : selected ? (
          <PageView
            key={selected.id}
            page={selected}
            author={members.find((m) => m.id === selected.user_id)}
            isMine={selected.user_id === me?.id}
            pagesState={pagesState}
          />
        ) : selectedId ? (
          <p className="muted">This page doesn't exist anymore. Pick another one on the left.</p>
        ) : (
          <div className="notes-empty">
            <h2>Notes</h2>
            <p className="muted">
              {pages.length === 0
                ? "No pages yet. "
                : `${pages.length} ${pages.length === 1 ? "page" : "pages"} so far. Pick one on the left, or start a new one. `}
              {canCreate
                ? "Click + next to a section to start a page. Type / inside a page for headings, lists, to-dos, code, tables and images."
                : "Sign in with GitHub as a lab member to write pages. Everyone can read them."}
            </p>
            {canCreate && (
              <button type="button" className="primary" onClick={() => onCreate("rag")}>New page in RAG course</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
