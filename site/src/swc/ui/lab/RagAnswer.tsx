import { useEffect, useState } from "react";
import { useRte } from "../../../rte/RteContext";
import { ragMessages, type LlmDevice } from "../../logic/lab/llm";

interface Props {
  readonly question: string;
  /** The top-k chunks, best first: exactly what goes into the prompt. */
  readonly chunks: readonly string[];
}

type Status =
  | { readonly name: "idle" }
  | { readonly name: "loading"; readonly pct: number | null }
  | { readonly name: "generating" }
  | { readonly name: "error"; readonly message: string };

const MAX_TOKENS = 160;

/** The "G" in RAG: a small LLM running in the browser writes an answer from the retrieved chunks. */
export function RagAnswer({ question, chunks }: Props) {
  const { llm } = useRte();
  const [status, setStatus] = useState<Status>({ name: "idle" });
  const [device, setDevice] = useState<LlmDevice | null>(null);
  const [answer, setAnswer] = useState("");
  const messages = ragMessages(question, chunks);
  const busy = status.name === "loading" || status.name === "generating";

  // Leaving (or new retrieval results, which remount this) stops a generation that's still running.
  useEffect(() => llm.stop, [llm]);

  const run = async () => {
    setAnswer("");
    try {
      setStatus({ name: "loading", pct: null });
      setDevice(await llm.load({ onDevice: setDevice, onProgress: (pct) => setStatus({ name: "loading", pct }) }));
      setStatus({ name: "generating" });
      const text = await llm.generate(messages, MAX_TOKENS, { onText: setAnswer });
      setAnswer(text);
      setStatus({ name: "idle" });
    } catch (err) {
      console.error("Local LLM failed", err);
      setStatus({
        name: "error",
        message: "The model couldn't run here. It needs a recent desktop browser and about 1 GB of free memory; Chrome or Edge with WebGPU works best.",
      });
    }
  };

  return (
    <div className="rag-answer">
      <div className="rag-answer-head">
        <div>
          <h3>Generate the answer</h3>
          <p className="muted small-text">
            Qwen2.5-0.5B-Instruct, running in your browser. First use downloads about 800 MB on a GPU or 500 MB on CPU (cached after that), so try it on Wi-Fi.
            {device && <> Running on <b>{device === "webgpu" ? "your GPU (WebGPU)" : "your CPU (slower)"}</b>.</>}
          </p>
        </div>
        {status.name === "generating" ? (
          <button type="button" className="btn btn-ghost" onClick={llm.stop}>Stop</button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={busy || chunks.length === 0}>
            {answer ? "Generate again" : "Generate answer"}
          </button>
        )}
      </div>

      {status.name === "loading" && (
        <div className="model-load" role="status">
          <span>{status.pct === null ? "Starting the model…" : `Loading the model (downloads the first time only)… ${status.pct}%`}</span>
          {status.pct !== null && <span className="load-bar"><i style={{ width: `${status.pct}%` }} /></span>}
        </div>
      )}
      {status.name === "error" && <p className="form-error">{status.message}</p>}
      {(answer || status.name === "generating") && (
        <p className={`llm-answer${status.name === "generating" ? " streaming" : ""}`} aria-live="polite">
          {answer || "Thinking…"}
        </p>
      )}

      <details className="stdout">
        <summary>See the exact prompt</summary>
        <pre>{messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n")}</pre>
      </details>
    </div>
  );
}
