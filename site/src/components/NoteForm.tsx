import { useState, type FormEvent } from "react";
import { LIMITS, validateNote, type Note, type NoteInput } from "../notes";
import { PHASES } from "../roadmap";

interface Props {
  readonly initial?: Note;
  readonly onSubmit: (input: NoteInput) => Promise<boolean>;
  readonly onCancel?: () => void;
}

export function NoteForm({ initial, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? "");
  const [itemId, setItemId] = useState(initial?.item_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const prefix = initial ? `edit-${initial.id}` : "new";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = validateNote({ title, body, source_url: sourceUrl, item_id: itemId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setSaving(true);
    const ok = await onSubmit(result.value);
    setSaving(false);
    if (ok && !initial) {
      setTitle("");
      setBody("");
      setSourceUrl("");
      setItemId("");
    }
  };

  return (
    <form className="note-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${prefix}-title`}>Title</label>
        <input id={`${prefix}-title`} value={title} maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Embeddings turn text into vectors" />
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-body`}>Note</label>
        <textarea id={`${prefix}-body`} value={body} maxLength={LIMITS.body} rows={initial ? 8 : 5} onChange={(e) => setBody(e.target.value)}
          placeholder="What you learned, in your own words. What's still unclear?" />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${prefix}-url`}>Source link <span className="opt">optional</span></label>
          <input id={`${prefix}-url`} type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…" />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-item`}>Roadmap item <span className="opt">optional</span></label>
          <select id={`${prefix}-item`} value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">None</option>
            {PHASES.map((p) => (
              <optgroup key={p.id} label={`${p.short} · ${p.title}`}>
                {p.items.map((i) => (
                  <option key={i.id} value={i.id}>{i.title}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={saving}>
          {saving ? "Saving…" : initial ? "Save changes" : "Post note"}
        </button>
        {onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
