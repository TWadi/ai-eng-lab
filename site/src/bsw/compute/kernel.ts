export type KernelState = "idle" | "loading" | "installing" | "running";

export interface CellOutput {
  readonly stdout: string;
  readonly stderr: string;
  /** repr() of the cell's last expression, like a notebook shows it. */
  readonly value: string | null;
  readonly error: string | null;
  /** matplotlib figures as base64 PNGs. */
  readonly images: readonly string[];
}

/** A cell may run this long before the kernel is restarted (the browser can't interrupt Python otherwise). */
export const CELL_TIMEOUT_MS = 60_000;

let worker: Worker | null = null;
let nextId = 1;
/** Resolves the cell that is running when the kernel gets killed. */
let abortRunning: ((reason: string) => void) | null = null;

function spawn(): Worker {
  worker = new Worker(new URL("./kernelWorker.ts", import.meta.url), { type: "module" });
  return worker;
}

function failed(error: string): CellOutput {
  return { stdout: "", stderr: "", value: null, error, images: [] };
}

/** Kill the kernel: all variables are lost and the next cell starts a fresh one. */
export function restartKernel(reason = "Kernel restarted. Variables from earlier cells are gone; run them again."): void {
  worker?.terminate();
  worker = null;
  abortRunning?.(reason);
  abortRunning = null;
}

export function runCell(code: string, onState: (s: KernelState, detail?: string) => void): Promise<CellOutput> {
  const w = worker ?? spawn();
  const id = nextId++;
  return new Promise((resolve) => {
    let timer: number | undefined;
    const finish = (out: CellOutput) => {
      window.clearTimeout(timer);
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onCrash);
      abortRunning = null;
      onState("idle");
      resolve(out);
    };
    abortRunning = (reason) => finish(failed(reason));
    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === "status") {
        onState(msg.state, msg.detail);
        if (msg.state === "running") {
          timer = window.setTimeout(
            () => restartKernel(`Stopped after ${CELL_TIMEOUT_MS / 1000} seconds and restarted the kernel. Is there an infinite loop?`),
            CELL_TIMEOUT_MS,
          );
        }
      } else if (msg.type === "result") {
        finish(msg.result as CellOutput);
      } else if (msg.type === "error") {
        finish(failed(`Python couldn't run this: ${msg.error}`));
      }
    };
    const onCrash = () => {
      if (worker === w) worker = null;
      finish(failed("The Python kernel crashed (maybe out of memory). Variables are gone; run the cells again."));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onCrash);
    w.postMessage({ id, code });
  });
}
