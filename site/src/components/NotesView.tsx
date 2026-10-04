import { useMemo, useState } from "react";
import type { Profile } from "../supabase";
import type { NotesState } from "../hooks/useNotes";
import { filterNotes } from "../notes";
import { PHASES } from "../roadmap";
import { NoteCard } from "./NoteCard";
import { NoteForm } from "./NoteForm";

interface Props {
  readonly notesState: NotesState;
  readonly members: readonly Profile[];
  readonly me: Profile | null;
}

export function NotesView({ notesState, members, me }: Props) {
  const { notes, loading, error, create, update, remove } = notesState;
  const [userId, setUserId] = useState<string | null>(null);
  const [phaseId, setPhaseId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const visible = filterNotes(notes, { userId, phaseId });
  const canPost = Boolean(me?.is_member);

  return (
    <div className="notes-view">
      {canPost ? (
        <section className="compose" aria-label="Write a note">
          <h2>New note</h2>
          <NoteForm onSubmit={create} />
        </section>
      ) : (
        <p className="muted compose-hint">Members sign in with GitHub to post notes. Everyone can read them.</p>
      )}

      {error && <p className="banner error" role="alert">{error}</p>}

      <div className="filters" role="group" aria-label="Filter notes">
        <div className="chips">
          <button type="button" className={`chip${userId === null ? " on" : ""}`} onClick={() => setUserId(null)}>Everyone</button>
          {members.map((m) => (
            <button key={m.id} type="button" className={`chip${userId === m.id ? " on" : ""}`} onClick={() => setUserId(m.id)}>
              {m.avatar_url && <img src={m.avatar_url} alt="" width={18} height={18} />}
              {m.github_username}
            </button>
          ))}
        </div>
        <label className="phase-filter">
          <span>Phase</span>
          <select id="notes-phase" value={phaseId ?? ""} onChange={(e) => setPhaseId(e.target.value || null)}>
            <option value="">All phases</option>
            {PHASES.map((p) => (
              <option key={p.id} value={p.id}>{p.short} · {p.title}</option>
            ))}
          </select>
        </label>
        <span className="count">{visible.length} {visible.length === 1 ? "note" : "notes"}</span>
      </div>

      <div className="note-list">
        {loading ? (
          <p className="muted">Loading notes…</p>
        ) : visible.length === 0 ? (
          <p className="muted empty">
            {notes.length === 0 ? "No notes yet. Write the first one about what you're watching right now." : "No notes match these filters."}
          </p>
        ) : (
          visible.map((n) => (
            <NoteCard key={n.id} note={n} author={byId.get(n.user_id)} isMine={n.user_id === me?.id} onUpdate={update} onDelete={remove} />
          ))
        )}
      </div>
    </div>
  );
}
