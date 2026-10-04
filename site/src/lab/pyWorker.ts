/// <reference lib="webworker" />
// Runs player code in Pyodide (CPython compiled to WebAssembly), off the main thread.
// The main thread kills this worker if a run takes too long (e.g. an infinite loop).

const PYODIDE_VERSION = "314.0.7";
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

interface RunMessage {
  readonly id: number;
  readonly code: string;
  readonly tests: string;
  readonly harnessUrl: string;
}

interface PyodideApi {
  runPython(code: string): unknown;
  globals: { get(name: string): (code: string, tests: string) => string };
}

let pyodide: PyodideApi | null = null;

async function boot(harnessUrl: string): Promise<PyodideApi> {
  const mod = await import(/* @vite-ignore */ `${INDEX_URL}pyodide.mjs`);
  const py: PyodideApi = await mod.loadPyodide({ indexURL: INDEX_URL });
  const res = await fetch(harnessUrl);
  if (!res.ok) throw new Error(`Couldn't load the test harness (${res.status})`);
  py.runPython(await res.text());
  return py;
}

self.onmessage = async (event: MessageEvent<RunMessage>) => {
  const { id, code, tests, harnessUrl } = event.data;
  try {
    if (!pyodide) {
      self.postMessage({ id, type: "status", state: "loading" });
      pyodide = await boot(harnessUrl);
    }
    self.postMessage({ id, type: "status", state: "running" });
    const out = pyodide.globals.get("run_tests")(code, tests);
    self.postMessage({ id, type: "result", result: JSON.parse(String(out)) });
  } catch (err) {
    self.postMessage({ id, type: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
