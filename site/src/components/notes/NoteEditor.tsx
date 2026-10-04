import { useEffect, useMemo, useRef, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

interface Props {
  readonly initialContent: unknown[];
  readonly editable: boolean;
  readonly onSave: (content: unknown[]) => Promise<boolean>;
  readonly onStatus: (status: SaveStatus) => void;
  readonly uploadFile: (file: File) => Promise<string>;
}

const SAVE_DELAY_MS = 800;

function usePrefersDark(): boolean {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return dark;
}

/** Notion-style block editor. Loaded lazily because the editor bundle is large. */
export default function NoteEditor({ initialContent, editable, onSave, onStatus, uploadFile }: Props) {
  const dark = usePrefersDark();
  const content = useMemo(
    () => (initialContent.length > 0 ? (initialContent as PartialBlock[]) : undefined),
    [initialContent],
  );
  const editor = useCreateBlockNote({ initialContent: content, uploadFile }, []);

  const timer = useRef<number | undefined>(undefined);
  const pending = useRef(false);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const flush = async () => {
    window.clearTimeout(timer.current);
    if (!pending.current) return;
    pending.current = false;
    onStatus("saving");
    const ok = await saveRef.current(editor.document as unknown[]);
    onStatus(ok ? (pending.current ? "unsaved" : "saved") : "error");
  };

  // Save whatever is pending when leaving the page.
  useEffect(() => () => void flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme={dark ? "dark" : "light"}
      onChange={() => {
        if (!editable) return;
        pending.current = true;
        onStatus("unsaved");
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
      }}
    />
  );
}
