import { useState } from "react";
import { useRte } from "../../../rte/RteContext";
import { RagAnswer } from "./RagAnswer";
import { chunkText, cosine, pca2d, rank, type Vec } from "../../logic/lab/vectors";

const SAMPLE_SENTENCES = [
  "The cat sat on the warm windowsill.",
  "A kitten is sleeping in the sun.",
  "Vector databases store embeddings for fast search.",
  "Chroma lets you search documents by meaning.",
  "I love eating pizza on Fridays.",
  "Our favourite dinner is pasta with tomato sauce.",
].join("\n");

const SAMPLE_DOC = `Retrieval augmented generation (RAG) lets a language model answer questions about documents it was never trained on. First, documents are split into chunks, usually a few hundred characters with some overlap so that sentences cut at a boundary still appear whole somewhere. Each chunk is turned into an embedding, a list of numbers that captures its meaning, and stored in a vector database such as Chroma. When a user asks a question, the question is embedded with the same model, and the database returns the chunks whose embeddings are most similar, usually measured with cosine similarity. Those chunks are pasted into the prompt as context, and the model writes an answer grounded in them. Hybrid search adds keyword matching with BM25, which helps with exact terms like product codes. A reranker can then reorder the top results with a slower but more accurate cross-encoder.`;

type Load = { readonly busy: boolean; readonly pct: number | null; readonly error: string | null };
const IDLE: Load = { busy: false, pct: null, error: null };

function useEmbed() {
  const { embedder } = useRte();
  const [load, setLoad] = useState<Load>(IDLE);
  const run = async (texts: string[]): Promise<Vec[] | null> => {
    setLoad({ busy: true, pct: null, error: null });
    try {
      const vectors = await embedder.embed(texts, (pct) => setLoad({ busy: true, pct, error: null }));
      setLoad(IDLE);
      return vectors;
    } catch (err) {
      console.error("Embedding failed", err);
      setLoad({ busy: false, pct: null, error: "Couldn't run the model. Check your connection (the first run downloads about 23 MB) and try again." });
      return null;
    }
  };
  return { load, run };
}

function LoadNote({ load }: { readonly load: Load }) {
  if (load.error) return <p className="form-error">{load.error}</p>;
  if (!load.busy) return null;
  return (
    <div className="model-load" role="status">
      <span>{load.pct === null ? "Running the model…" : `Downloading the model (first time only)… ${load.pct}%`}</span>
      {load.pct !== null && <span className="load-bar"><i style={{ width: `${load.pct}%` }} /></span>}
    </div>
  );
}

/** Color for a similarity in [-1, 1]: pale to strong cobalt (reads in both themes on the card background). */
function heat(sim: number): string {
  const t = Math.max(0, Math.min(1, sim));
  return `rgb(63 91 255 / ${0.08 + t * 0.85})`;
}

function SimilarityLab() {
  const [text, setText] = useState(SAMPLE_SENTENCES);
  const [result, setResult] = useState<{ sentences: string[]; matrix: number[][]; points: Array<[number, number]> } | null>(null);
  const { load, run } = useEmbed();

  const go = async () => {
    const sentences = text.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 12);
    if (sentences.length < 2) return;
    const vectors = await run(sentences);
    if (!vectors) return;
    setResult({ sentences, matrix: vectors.map((a) => vectors.map((b) => cosine(a, b))), points: pca2d(vectors) });
  };

  const pts = result?.points ?? [];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => 40 + ((x - minX) / (maxX - minX || 1)) * 420;
  const sy = (y: number) => 30 + ((y - minY) / (maxY - minY || 1)) * 220;

  return (
    <section className="panel" aria-labelledby="sim-title">
      <div className="panel-head">
        <h2 id="sim-title" className="panel-title">Sentence similarity</h2>
        <span className="muted small-text">Model: all-MiniLM-L6-v2 · 384 dimensions</span>
      </div>
      <p className="muted">One sentence per line (up to 12). Sentences about the same topic should score high and land close together, even when they share no words.</p>
      <label className="sr-only" htmlFor="sim-input">Sentences</label>
      <textarea id="sim-input" className="lab-textarea" rows={7} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="run-bar">
        <button type="button" className="btn btn-primary" onClick={() => void go()} disabled={load.busy}>Embed and compare</button>
      </div>
      <LoadNote load={load} />

      {result && (
        <div className="sim-results">
          <div className="heatmap-wrap">
            <table className="heatmap">
              <caption className="muted small-text">Cosine similarity between every pair</caption>
              <thead>
                <tr><th />{result.sentences.map((_, i) => <th key={i} scope="col">{i + 1}</th>)}</tr>
              </thead>
              <tbody>
                {result.matrix.map((row, i) => (
                  <tr key={i}>
                    <th scope="row">{i + 1}</th>
                    {row.map((v, j) => (
                      <td key={j} style={{ background: heat(v), color: v > 0.55 ? "#fff" : undefined }} title={`${i + 1} vs ${j + 1}: ${v.toFixed(3)}`}>
                        {v.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="map-wrap">
            <svg viewBox="0 0 500 280" className="embed-map" role="img" aria-label="Sentences placed on a 2D map by meaning">
              {pts.map(([x, y], i) => (
                <g key={i}>
                  <circle cx={sx(x)} cy={sy(y)} r={14} className="map-dot" />
                  <text x={sx(x)} y={sy(y) + 5} textAnchor="middle" className="map-num">{i + 1}</text>
                </g>
              ))}
            </svg>
            <p className="muted small-text">2D map (PCA of the 384-dimensional embeddings). Close dots = similar meaning.</p>
          </div>
          <ol className="sentence-key">
            {result.sentences.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      )}
    </section>
  );
}

function MiniRag() {
  const [doc, setDoc] = useState(SAMPLE_DOC);
  const [size, setSize] = useState(220);
  const [overlap, setOverlap] = useState(40);
  const [k, setK] = useState(3);
  const [question, setQuestion] = useState("How do we find the chunks that answer a question?");
  const [hits, setHits] = useState<Array<{ index: number; score: number; text: string }> | null>(null);
  const [asked, setAsked] = useState("");
  const { load, run } = useEmbed();

  const chunks = (() => {
    try {
      return chunkText(doc.trim(), size, Math.min(overlap, size - 1));
    } catch {
      return [];
    }
  })();

  const go = async () => {
    if (!question.trim() || chunks.length === 0) return;
    const vectors = await run([question.trim(), ...chunks]);
    if (!vectors) return;
    const [q, ...docs] = vectors;
    setHits(rank(q, docs).map((r) => ({ ...r, text: chunks[r.index] })));
    setAsked(question.trim());
  };

  return (
    <section className="panel" aria-labelledby="rag-title">
      <div className="panel-head">
        <h2 id="rag-title" className="panel-title">Mini RAG: retrieve, then generate</h2>
        <span className="muted small-text">{chunks.length} chunks</span>
      </div>
      <p className="muted">Paste any text, choose how to chunk it, ask a question, and see which chunks a retriever would hand to the LLM. Then let a small LLM in your browser write the answer from them.</p>
      <label className="sr-only" htmlFor="rag-doc">Document</label>
      <textarea id="rag-doc" className="lab-textarea" rows={6} value={doc} onChange={(e) => { setDoc(e.target.value); setHits(null); }} />
      <div className="rag-controls">
        <label>Chunk size <b>{size}</b><input id="rag-size" type="range" min={60} max={600} step={10} value={size} onChange={(e) => { setSize(Number(e.target.value)); setHits(null); }} /></label>
        <label>Overlap <b>{Math.min(overlap, size - 1)}</b><input id="rag-overlap" type="range" min={0} max={200} step={5} value={overlap} onChange={(e) => { setOverlap(Number(e.target.value)); setHits(null); }} /></label>
        <label>Top k <b>{k}</b><input id="rag-k" type="range" min={1} max={6} value={k} onChange={(e) => setK(Number(e.target.value))} /></label>
      </div>
      <div className="rag-ask">
        <label className="sr-only" htmlFor="rag-q">Question</label>
        <input id="rag-q" className="lab-input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question about the text" />
        <button type="button" className="btn btn-primary" onClick={() => void go()} disabled={load.busy || chunks.length === 0}>Retrieve</button>
      </div>
      <LoadNote load={load} />

      {hits && (
        <ol className="hits">
          {hits.map((h, rankIdx) => (
            <li key={h.index} className={rankIdx < k ? "top" : ""}>
              <div className="hit-head">
                <span className="hit-rank">#{rankIdx + 1}</span>
                <span className="hit-chunk">chunk {h.index + 1}</span>
                <span className="hit-bar"><i style={{ width: `${Math.max(0, h.score) * 100}%` }} /></span>
                <span className="hit-score">{h.score.toFixed(3)}</span>
                {rankIdx < k && <span className="solved-pill">sent to LLM</span>}
              </div>
              <p className="hit-text">{h.text}</p>
            </li>
          ))}
        </ol>
      )}
      {hits && (
        <RagAnswer
          key={`${asked}|${hits.slice(0, k).map((h) => h.index).join(",")}`}
          question={asked}
          chunks={hits.slice(0, k).map((h) => h.text)}
        />
      )}
    </section>
  );
}

export function Playground() {
  return (
    <div className="playground">
      <p className="banner info">
        Everything here runs in your browser with transformers.js. The embedding model is small (about 23 MB); the optional answer step uses a 500–800 MB LLM. Both download once from Hugging Face and are cached.
      </p>
      <SimilarityLab />
      <MiniRag />
    </div>
  );
}
