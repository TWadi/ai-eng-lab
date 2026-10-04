import type { Vec } from "./vectors";

let worker: Worker | null = null;
let nextId = 1;

/** Embed texts with the in-browser model. onProgress gets 0-100 while the model downloads (first use only). */
export function embed(texts: readonly string[], onProgress: (pct: number) => void): Promise<Vec[]> {
  worker ??= new Worker(new URL("./embedWorker.ts", import.meta.url), { type: "module" });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === "progress") {
        onProgress(Math.round(msg.progress));
        return;
      }
      w.removeEventListener("message", onMessage);
      if (msg.type === "result") resolve(msg.vectors as Vec[]);
      else reject(new Error(msg.error ?? "Embedding failed"));
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ id, texts });
  });
}
