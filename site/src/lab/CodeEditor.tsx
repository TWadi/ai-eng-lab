import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";

interface Props {
  readonly value: string;
  readonly onChange: (code: string) => void;
  readonly onRun: () => void;
  /** Changing this key replaces the editor content with `value` (e.g. after Reset). */
  readonly resetKey: number;
}

export function CodeEditor({ value, onChange, onRun, resetKey }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const handlers = useRef({ onChange, onRun });
  handlers.current = { onChange, onRun };

  useEffect(() => {
    if (!host.current) return;
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    view.current = new EditorView({
      doc: value,
      parent: host.current,
      extensions: [
        basicSetup,
        python(),
        keymap.of([
          { key: "Mod-Enter", run: () => { handlers.current.onRun(); return true; } },
          indentWithTab,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) handlers.current.onChange(u.state.doc.toString());
        }),
        EditorView.contentAttributes.of({ "aria-label": "Python code editor" }),
        ...(dark ? [oneDark] : []),
      ],
    });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
    // Create once per reset; the editor owns its text between resets.
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="code-editor" ref={host} />;
}
