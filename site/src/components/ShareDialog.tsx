import { useEffect, useRef, useState } from "react";
import { canvasToBlob, drawCard } from "../drawCard";
import { availableCards, buildCard, cardLabel, SITE_URL, type CardInput, type CardKind } from "../share";

interface Props {
  readonly input: CardInput;
  readonly avatarUrl: string | null;
  readonly color: string;
  readonly onClose: () => void;
}

type Status = { readonly kind: "idle" | "ok" | "error"; readonly text: string };

export function ShareDialog({ input, avatarUrl, color, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cards = availableCards(input.stats);
  const [kindIndex, setKindIndex] = useState(0);
  const [drawing, setDrawing] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });
  const kind: CardKind = cards[Math.min(kindIndex, cards.length - 1)];
  const model = buildCard(kind, input);
  const canShareFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    setDrawing(true);
    drawCard(canvas, model, avatarUrl, color)
      .catch((err) => {
        console.error("Failed to draw card", err);
        if (!cancelled) setStatus({ kind: "error", text: "Couldn't draw the card in this browser." });
      })
      .finally(() => !cancelled && setDrawing(false));
    return () => {
      cancelled = true;
    };
    // Redraw only when the chosen card changes; the model is derived from it.
  }, [kindIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const say = (kind: Status["kind"], text: string) => setStatus({ kind, text });

  const download = async () => {
    try {
      const blob = await canvasToBlob(canvasRef.current!);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = model.fileName;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      say("ok", "Downloaded. Attach it to your LinkedIn post.");
    } catch (err) {
      console.error("Download failed", err);
      say("error", "Couldn't create the image. If your avatar didn't load, try again in a moment.");
    }
  };

  const copyImage = async () => {
    try {
      const blob = await canvasToBlob(canvasRef.current!);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      say("ok", "Image copied. Paste it straight into a LinkedIn post.");
    } catch (err) {
      console.error("Copy image failed", err);
      say("error", "This browser can't copy images. Use Download instead.");
    }
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(model.caption);
      say("ok", "Caption copied.");
    } catch {
      say("error", "Couldn't copy. Select the caption text and copy it by hand.");
    }
  };

  const share = async () => {
    try {
      const blob = await canvasToBlob(canvasRef.current!);
      const file = new File([blob], model.fileName, { type: "image/png" });
      if (!navigator.canShare?.({ files: [file] })) {
        say("error", "Sharing files isn't supported here. Use Download instead.");
        return;
      }
      await navigator.share({ files: [file], text: model.caption, title: "AI Engineering Lab" });
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") {
        console.error("Share failed", err);
        say("error", "Sharing didn't work. Use Download instead.");
      }
    }
  };

  const linkedIn = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SITE_URL)}`;

  return (
    <dialog ref={dialogRef} className="quiz share" onClose={onClose} aria-labelledby="share-title">
      <header className="quiz-head share-head">
        <div>
          <div className="ph-code">Share</div>
          <h2 id="share-title">Make a card</h2>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Close</button>
      </header>

      <div className="quiz-body">
        <div className="chips" role="radiogroup" aria-label="Card type">
          {cards.map((c, i) => (
            <button
              key={`${c.type}-${"id" in c ? c.id : ""}`}
              type="button"
              role="radio"
              aria-checked={i === kindIndex}
              className={`chip${i === kindIndex ? " on" : ""}`}
              onClick={() => { setKindIndex(i); setStatus({ kind: "idle", text: "" }); }}
            >
              {cardLabel(c)}
            </button>
          ))}
        </div>

        <div className={`card-preview${drawing ? " drawing" : ""}`}>
          <canvas ref={canvasRef} width={1200} height={627} role="img" aria-label={`${model.eyebrow}: ${model.headline}`} />
        </div>

        <div className="share-actions">
          <button type="button" className="btn btn-primary" onClick={() => void download()} disabled={drawing}>Download PNG</button>
          <button type="button" className="btn btn-ghost" onClick={() => void copyImage()} disabled={drawing}>Copy image</button>
          {canShareFiles && <button type="button" className="btn btn-ghost" onClick={() => void share()} disabled={drawing}>Share…</button>}
          <a className="btn btn-ghost" href={linkedIn} target="_blank" rel="noopener">Open LinkedIn ↗</a>
        </div>

        <div className="caption-box">
          <div className="panel-head">
            <span className="caption-label">Caption</span>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => void copyCaption()}>Copy caption</button>
          </div>
          <textarea id="share-caption" readOnly value={model.caption} rows={5} onFocus={(e) => e.currentTarget.select()} />
        </div>

        {status.text && <p className={status.kind === "error" ? "form-error" : "share-ok"} role="status">{status.text}</p>}
      </div>
    </dialog>
  );
}
