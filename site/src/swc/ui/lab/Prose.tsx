import type { ReactNode } from "react";

/** Tiny renderer for challenge prompts: paragraphs, "- " lists and `inline code`. No HTML injection. */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : <span key={i}>{part}</span>,
  );
}

export function Prose({ text }: { readonly text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="prose">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*(-|\d+\.)\s/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const items = lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*(-|\d+\.)\s/, ""))}</li>);
          return ordered ? <ol key={bi}>{items}</ol> : <ul key={bi}>{items}</ul>;
        }
        const head = lines.filter((l) => !/^\s*(-|\d+\.)\s/.test(l));
        const list = lines.filter((l) => /^\s*(-|\d+\.)\s/.test(l));
        return (
          <div key={bi}>
            {head.length > 0 && <p>{inline(head.join(" "))}</p>}
            {list.length > 0 && <ul>{list.map((l, li) => <li key={li}>{inline(l.replace(/^\s*(-|\d+\.)\s/, ""))}</li>)}</ul>}
          </div>
        );
      })}
    </div>
  );
}
