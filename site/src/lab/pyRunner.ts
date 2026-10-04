import type { ChallengeTest, RunResult } from "./challenges";

export type RunnerState = "idle" | "loading" | "running";

/** Max time for one run once Python is loaded. Loading itself (a one-time ~10 MB download) is not timed. */
const RUN_TIMEOUT_MS = 8000;

let worker: Worker | null = null;
let nextId = 1;

function spawn(): Worker {
  worker = new Worker(new URL("./pyWorker.ts", import.meta.url), { type: "module" });
  return worker;
}

/** Run code against tests in a worker. If it hangs, the worker is killed and the next run starts fresh. */
export function runChallenge(
  code: string,
  tests: readonly ChallengeTest[],
  onState: (s: RunnerState) => void,
): Promise<RunResult> {
  const w = worker ?? spawn();
  const id = nextId++;
  const harnessUrl = `${import.meta.env.BASE_URL}harness.py`;

  return new Promise((resolve) => {
    let timer: number | undefined;
    const finish = (r: RunResult) => {
      window.clearTimeout(timer);
      w.removeEventListener("message", onMessage);
      onState("idle");
      resolve(r);
    };
    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === "status") {
        onState(msg.state);
        if (msg.state === "running") {
          timer = window.setTimeout(() => {
            w.terminate();
            worker = null;
            finish({ error: `Stopped after ${RUN_TIMEOUT_MS / 1000} seconds. Is there an infinite loop?`, stdout: "", results: [] });
          }, RUN_TIMEOUT_MS);
        }
      } else if (msg.type === "result") {
        finish(msg.result as RunResult);
      } else if (msg.type === "error") {
        finish({ error: `Python couldn't start: ${msg.error}`, stdout: "", results: [] });
      }
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ id, code, tests: JSON.stringify(tests.map(({ name, code: c }) => ({ name, code: c }))), harnessUrl });
  });
}
