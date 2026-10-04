import { useState } from "react";
import type { Profile } from "../supabase";
import { findItem, linkify, type Note, type NoteInput } from "../notes";
import { NoteForm } from "./NoteForm";

interface Props {
  readonly note: Note;
  readonly author: Profile | undefined;
  readonly isMine: boolean;
  readonly onUpdate: (id: string, input: NoteInput) => Promise<boolean>;
  readonly onDelete: (id: string) => Promise<boolean>;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function NoteCard({ note, author, isMine, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const linked = note.item_id ? findItem(note.item_id) : undefined;
  const edited = note.updated_at.slice(0, 19) !== note.created_at.slice(0, 19);
  const name = author?.display_name || author?.github_username || "Someone";

  return (
    <article className="note">
      <header className="note-head">
        {author?.avatar_url ? <img src={author.avatar_url} alt="" width={32} height={32} /> : <span className="avatar-fallback small" />}
        <div className="note-meta">
          <span className="note-author">{name}</span>
          <span className="note-time">
            {fmt(note.created_at)}
            {edited && " · edited"}
          </span>
        </div>
        {isMine && !editing && (
          <div className="note-actions">
            {confirming ? (
              <>
                <span className="muted">Delete this note?</span>
                <button type="button" className="danger" onClick={() => onDelete(note.id)}>Delete</button>
                <button type="button" className="ghost" onClick={() => setConfirming(false)}>Keep</button>
              </>
            ) : (
              <>
                <button type="button" className="ghost" onClick={() => setEditing(true)}>Edit</button>
                <button type="button" className="ghost" onClick={() => setConfirming(true)}>Delete</button>
              </>
            )}
          </div>
        )}
      </header>

      {editing ? (
        <NoteForm
          initial={note}
          onSubmit={async (input) => {
            const ok = await onUpdate(note.id, input);
            if (ok) setEditing(false);
            return ok;
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <h3 className="note-title">{note.title}</h3>
          <p className="note-body">
            {linkify(note.body).map((part, i) =>
              part.href ? (
                <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </p>
          {(note.source_url || linked) && (
            <footer className="note-tags">
              {linked && (
                <a className="tag" href={`#${linked.phase.id}`}>
                  {linked.phase.code} · {linked.item.title}
                </a>
              )}
              {note.source_url && (
                <a className="tag source" href={note.source_url} target="_blank" rel="noopener noreferrer">
                  {hostOf(note.source_url)} ↗
                </a>
              )}
            </footer>
          )}
        </>
      )}
    </article>
  );
}
