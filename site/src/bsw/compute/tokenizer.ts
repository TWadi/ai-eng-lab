import type { Tokenized } from "../../swc/logic/lab/tokenizer";

let worker: Worker | null = null;
let nextId = 1;

export function tokenize(model: string, text: string): Promise<Tokenized> {
  worker ??= new Worker(new URL("./tokWorker.ts", import.meta.url), { type: "module" });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.id !== id) return;
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onCrash);
      if (msg.type === "result") resolve({ ids: msg.ids, pieces: msg.pieces, raw: msg.raw });
      else reject(new Error(msg.error ?? "Tokenizing failed"));
    };
    const onCrash = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onCrash);
      if (worker === w) worker = null;
      reject(new Error("The worker crashed"));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onCrash);
    w.postMessage({ id, model, text });
  });
}
