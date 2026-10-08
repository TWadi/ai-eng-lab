export type LlmDevice = "webgpu" | "wasm";

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface LlmCallbacks {
  /** 0-100 while the model downloads (first use only). */
  readonly onProgress?: (pct: number) => void;
  readonly onDevice?: (device: LlmDevice) => void;
  /** The whole answer so far, each time a new piece arrives. */
  readonly onText?: (text: string) => void;
}

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  worker ??= new Worker(new URL("./llmWorker.ts", import.meta.url), { type: "module" });
  return worker;
}

function request<T>(message: Record<string, unknown>, cb: LlmCallbacks, settle: (msg: { type: string; text?: string; device?: LlmDevice }) => T | undefined): Promise<T> {
  const w = getWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === "progress") cb.onProgress?.(Math.round(msg.progress));
      else if (msg.type === "device") cb.onDevice?.(msg.device);
      else if (msg.type === "token") cb.onText?.(msg.text);
      else if (msg.type === "error") {
        cleanup();
        reject(new Error(msg.error ?? "The model failed"));
      } else {
        const value = settle(msg);
        if (value !== undefined) {
          cleanup();
          resolve(value);
        }
      }
    };
    const onCrash = () => {
      cleanup();
      if (worker === w) worker = null;
      reject(new Error("The model worker crashed (maybe out of memory)"));
    };
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onCrash);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onCrash);
    w.postMessage({ ...message, id });
  });
}

/** Download (first time) and start the model. Resolves with the device it runs on. */
export function loadLlm(cb: LlmCallbacks = {}): Promise<LlmDevice> {
  return request({ type: "load" }, cb, (msg) => (msg.type === "ready" ? msg.device : undefined));
}

/** Generate a reply, streaming it through cb.onText. Resolves with the full text. */
export function generate(messages: readonly ChatMessage[], maxTokens: number, cb: LlmCallbacks = {}): Promise<string> {
  return request({ type: "generate", messages, maxTokens }, cb, (msg) => (msg.type === "done" ? msg.text ?? "" : undefined));
}

/** Stop the current generation early (the text so far is kept). */
export function stopGenerating(): void {
  worker?.postMessage({ type: "stop" });
}

/** The prompt the Mini RAG sends: the retrieved chunks as numbered context, then the question. */
export function ragMessages(question: string, chunks: readonly string[]): ChatMessage[] {
  const context = chunks.map((c, i) => `[${i + 1}] ${c.trim()}`).join("\n\n");
  return [
    {
      role: "system",
      content:
        "You answer questions using only the context provided. Cite the chunks you used like [1]. " +
        "If the context does not contain the answer, say you don't know. Keep answers short.",
    },
    { role: "user", content: `Context:\n${context}\n\nQuestion: ${question.trim()}` },
  ];
}
