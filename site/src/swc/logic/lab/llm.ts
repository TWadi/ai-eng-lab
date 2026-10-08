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
