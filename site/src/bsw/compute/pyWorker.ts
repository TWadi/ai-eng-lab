/// <reference lib="webworker" />
// Runs player code in Pyodide (CPython compiled to WebAssembly), off the main thread.
// The main thread kills this worker if a run takes too long (e.g. an infinite loop).

import { PYODIDE_INDEX_URL as INDEX_URL } from "./pyodide";

interface RunMessage {
  readonly id: number;
  /** Absent for a preload: just boot Python so the first real run starts instantly. */
  readonly code?: string;
  readonly tests?: string;
  readonly harnessUrl: string;
}

interface PyodideApi {
  runPython(code: string): unknown;
  globals: { get(name: string): (code: string, tests: string) => string };
}

let pyodide: Promise<PyodideApi> | null = null;
let ready = false;

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
      // Keep the promise, so a run that arrives during a preload waits for it instead of booting twice.
      pyodide = boot(harnessUrl);
      pyodide.catch(() => {
        pyodide = null;
      });
    }
    if (!ready) self.postMessage({ id, type: "status", state: "loading" });
    const py = await pyodide;
    ready = true;
    if (code === undefined || tests === undefined) {
      self.postMessage({ id, type: "ready" });
      return;
    }
    self.postMessage({ id, type: "status", state: "running" });
    const out = py.globals.get("run_tests")(code, tests);
    self.postMessage({ id, type: "result", result: JSON.parse(String(out)) });
  } catch (err) {
    self.postMessage({ id, type: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
