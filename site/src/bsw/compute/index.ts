import type { EmbedPort, KernelPort, LlmPort, PythonPort, TokenizerPort } from "../../rte/ports";
import { embed } from "./embedder";
import { restartKernel, runCell } from "./kernel";
import { generate, loadLlm, stopGenerating } from "./llm";
import { preloadPython, runChallenge } from "./pyRunner";
import { tokenize } from "./tokenizer";

/** Python, models and tokenizers, each running in its own Web Worker (off the UI thread). */
export const compute = {
  python: { run: runChallenge, preload: preloadPython } satisfies PythonPort,
  kernel: { runCell, restart: restartKernel } satisfies KernelPort,
  embedder: { embed } satisfies EmbedPort,
  tokenizer: { tokenize } satisfies TokenizerPort,
  llm: { load: loadLlm, generate, stop: stopGenerating } satisfies LlmPort,
};
