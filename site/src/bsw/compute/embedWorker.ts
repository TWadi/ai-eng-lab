/// <reference lib="webworker" />
// Runs a small sentence-embedding model (all-MiniLM-L6-v2, 384 dimensions) in the browser with transformers.js.
// The model (~23 MB, quantized) downloads from Hugging Face once and is cached by the browser.

import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

let extractor: Promise<FeatureExtractionPipeline> | null = null;

interface EmbedMessage {
  readonly id: number;
  readonly texts: readonly string[];
}

self.onmessage = async (event: MessageEvent<EmbedMessage>) => {
  const { id, texts } = event.data;
  try {
    extractor ??= pipeline("feature-extraction", MODEL_ID, {
      dtype: "q8",
      progress_callback: (p: { status?: string; progress?: number; file?: string }) => {
        if (p.status === "progress" && typeof p.progress === "number") {
          self.postMessage({ id, type: "progress", progress: p.progress, file: p.file ?? "" });
        }
      },
    }) as Promise<FeatureExtractionPipeline>;
    const model = await extractor;
    const output = await model([...texts], { pooling: "mean", normalize: true });
    self.postMessage({ id, type: "result", vectors: output.tolist() });
  } catch (err) {
    extractor = null;
    self.postMessage({ id, type: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
