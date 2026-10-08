import { useCallback, useEffect, useRef, useState } from "react";
import { CodeEditor } from "./CodeEditor";
import { restartKernel, runCell, type CellOutput, type KernelState } from "../../../bsw/compute/kernel";

interface Cell {
  readonly id: string;
  readonly code: string;
}

interface CellResult {
  /** Execution count, like In [3] in Jupyter. */
  readonly n: number;
  readonly out: CellOutput;
}

const STORAGE_KEY = "ai-eng-lab:scratchpad";

const STARTER: readonly string[] = [
  `# A Python scratchpad that runs in your browser, like a mini Jupyter.
# Variables carry over between cells. Shift + Enter runs a cell.
import numpy as np

a = np.array([0.2, 0.9, 0.1])
b = np.array([0.25, 0.8, 0.0])
a @ b / (np.linalg.norm(a) * np.linalg.norm(b))   # cosine similarity`,
  `import pandas as pd

df = pd.DataFrame({"chunk_size": [100, 200, 400, 800], "recall_at_5": [0.61, 0.74, 0.79, 0.71]})
df.describe()`,
  `import matplotlib.pyplot as plt

plt.plot(df.chunk_size, df.recall_at_5, marker="o")
plt.xlabel("chunk size"); plt.ylabel("recall@5"); plt.title("Bigger isn't always better")
plt.show()`,
];

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function loadCells(): readonly Cell[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((c) => typeof c?.id === "string" && typeof c?.code === "string")) {
      return parsed as Cell[];
    }
  } catch {
    // Unreadable or blocked storage: start from the examples.
  }
  return STARTER.map((code) => ({ id: newId(), code }));
}

function saveCells(cells: readonly Cell[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cells));
  } catch {
    // Storage blocked: the notebook just isn't kept.
  }
}

function statusText(state: KernelState, detail: string | undefined): string {
  if (state === "loading") return "Starting Python (about 10 MB, first time only)…";
  if (state === "installing") return `Installing ${detail ?? "packages"}…`;
  if (state === "running") return "Running…";
  return "Ready";
}

function Output({ result }: { readonly result: CellResult }) {
  const { out } = result;
  const empty = !out.stdout && !out.stderr && !out.value && !out.error && out.images.length === 0;
  if (empty) return null;
  return (
    <div className="cell-out">
      {out.stdout && <pre>{out.stdout}</pre>}
      {out.stderr && <pre className="cell-stderr">{out.stderr}</pre>}
      {out.images.map((b64, i) => <img key={i} src={`data:image/png;base64,${b64}`} alt={`Figure ${i + 1} from cell ${result.n}`} />)}
      {out.value && <pre className="cell-value">{out.value}</pre>}
      {out.error && <pre className="cell-error">{out.error}</pre>}
    </div>
  );
}

export function Scratchpad() {
  const [cells, setCells] = useState<readonly Cell[]>(loadCells);
  const [results, setResults] = useState<Readonly<Record<string, CellResult>>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [kernel, setKernel] = useState<{ state: KernelState; detail?: string }>({ state: "idle" });
  const [started, setStarted] = useState(false);
  const counter = useRef(0);
  const busy = useRef(false);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;

  useEffect(() => {
    const t = window.setTimeout(() => saveCells(cells), 400);
    return () => window.clearTimeout(t);
  }, [cells]);

  // Leaving the scratchpad stops the kernel and frees its memory (variables are lost, cells are kept).
  useEffect(() => () => restartKernel(""), []);

  const runOne = useCallback(async (id: string): Promise<boolean> => {
    const cell = cellsRef.current.find((c) => c.id === id);
    if (!cell) return false;
    setRunning(id);
    setStarted(true);
    const out = await runCell(cell.code, (state, detail) => setKernel({ state, detail }));
    counter.current += 1;
    setResults((cur) => ({ ...cur, [id]: { n: counter.current, out } }));
    setRunning(null);
    return out.error === null;
  }, []);

  const run = useCallback(async (ids: readonly string[]) => {
    if (busy.current) return;
    busy.current = true;
    for (const id of ids) {
      if (!(await runOne(id))) break;
    }
    busy.current = false;
  }, [runOne]);

  const restart = () => {
    restartKernel();
    counter.current = 0;
    setResults({});
    setStarted(false);
  };

  const update = (id: string, code: string) => setCells((cur) => cur.map((c) => (c.id === id ? { ...c, code } : c)));
  const insertAfter = (index: number) => setCells((cur) => [...cur.slice(0, index + 1), { id: newId(), code: "" }, ...cur.slice(index + 1)]);
  const remove = (id: string) => {
    setCells((cur) => (cur.length > 1 ? cur.filter((c) => c.id !== id) : cur));
    setResults((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== id)));
  };
  const move = (index: number, by: -1 | 1) =>
    setCells((cur) => {
      const to = index + by;
      if (to < 0 || to >= cur.length) return cur;
      const next = [...cur];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const resetExamples = () => {
    restart();
    setCells(STARTER.map((code) => ({ id: newId(), code })));
  };

  return (
    <div className="playground">
      <p className="banner info">
        Real Python (Pyodide) in your browser, with numpy, pandas, matplotlib and scikit-learn installed the first time you import them. Your cells are saved in this browser only.
      </p>
      <section className="panel scratchpad" aria-labelledby="pad-title">
        <div className="panel-head pad-head">
          <h2 id="pad-title" className="panel-title">Scratchpad</h2>
          <span className={`kernel-pill state-${kernel.state}`} role="status">
            {started || kernel.state !== "idle" ? statusText(kernel.state, kernel.detail) : "Python starts on your first run"}
          </span>
          <div className="pad-tools">
            <button type="button" className="btn btn-primary btn-small" onClick={() => void run(cells.map((c) => c.id))} disabled={running !== null}>Run all</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={restart}>{running ? "Stop" : "Restart"}</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setResults({})} disabled={running !== null}>Clear outputs</button>
            <button type="button" className="btn-link" onClick={resetExamples}>Reset to examples</button>
          </div>
        </div>

        <ol className="cells">
          {cells.map((cell, i) => {
            const result = results[cell.id];
            const isRunning = running === cell.id;
            return (
              <li key={cell.id} className={`cell${isRunning ? " running" : ""}`}>
                <div className="cell-row">
                  <span className="cell-n" aria-hidden="true">[{isRunning ? "*" : result?.n ?? " "}]</span>
                  <CodeEditor
                    value={cell.code}
                    onChange={(code) => update(cell.id, code)}
                    onRun={() => void run([cell.id])}
                    resetKey={0}
                    shiftEnterRuns
                    label={`Cell ${i + 1}`}
                  />
                  <div className="cell-tools">
                    <button type="button" className="icon-btn" onClick={() => void run([cell.id])} disabled={running !== null} aria-label={`Run cell ${i + 1}`} title="Run (Shift + Enter)">▶</button>
                    <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move cell ${i + 1} up`} title="Move up">↑</button>
                    <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === cells.length - 1} aria-label={`Move cell ${i + 1} down`} title="Move down">↓</button>
                    <button type="button" className="icon-btn" onClick={() => remove(cell.id)} disabled={cells.length === 1} aria-label={`Delete cell ${i + 1}`} title="Delete">✕</button>
                  </div>
                </div>
                {result && <Output result={result} />}
                <button type="button" className="add-cell" onClick={() => insertAfter(i)}>+ Add cell</button>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
