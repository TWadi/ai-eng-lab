import { useState } from "react";
import type { Profile } from "../../supabase";
import { displayTitle, groupByTrack, type PageMeta } from "../../pages";

interface Props {
  readonly pages: readonly PageMeta[];
  readonly members: readonly Profile[];
  readonly selectedId: string | null;
  readonly canCreate: boolean;
  readonly onCreate: (trackId: string | null) => void;
}

export function PageSidebar({ pages, members, selectedId, canCreate, onCreate }: Props) {
  const [authorId, setAuthorId] = useState<string | null>(null);
  const byId = new Map(members.map((m) => [m.id, m]));
  const groups = groupByTrack(pages, authorId);

  return (
    <aside className="page-sidebar" aria-label="Note pages">
      <div className="chips">
        <button type="button" className={`chip${authorId === null ? " on" : ""}`} onClick={() => setAuthorId(null)}>Everyone</button>
        {members.map((m) => (
          <button key={m.id} type="button" className={`chip${authorId === m.id ? " on" : ""}`} onClick={() => setAuthorId(m.id)}>
            {m.avatar_url && <img src={m.avatar_url} alt="" width={16} height={16} />}
            {m.github_username}
          </button>
        ))}
      </div>

      {groups.map(({ track, pages: list }) =>
        list.length === 0 && !canCreate ? null : (
          <section key={track.id ?? "general"} className="page-group">
            <div className="page-group-head">
              <span className="code">{track.short}</span>
              <span className="page-group-title">{track.title}</span>
              {canCreate && (
                <button type="button" className="icon-btn" onClick={() => onCreate(track.id)} aria-label={`New page in ${track.title}`} title="New page">
                  +
                </button>
              )}
            </div>
            {list.map((p) => {
              const author = byId.get(p.user_id);
              return (
                <a key={p.id} href={`#notes/${p.id}`} className={`page-link${p.id === selectedId ? " on" : ""}`}>
                  {author?.avatar_url ? <img src={author.avatar_url} alt={author.github_username} width={16} height={16} /> : <span className="dot" />}
                  <span className="page-link-title">{displayTitle(p.title)}</span>
                </a>
              );
            })}
          </section>
        ),
      )}
    </aside>
  );
}
