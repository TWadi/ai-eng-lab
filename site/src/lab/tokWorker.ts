/// <reference lib="webworker" />
// Loads tokenizers (just the tokenizer files, no model weights) with transformers.js and splits text into tokens.

import { AutoTokenizer, type PreTrainedTokenizer } from "@huggingface/transformers";

interface TokenizeMessage {
  readonly id: number;
  readonly model: string;
  readonly text: string;
}

const loaded = new Map<string, Promise<PreTrainedTokenizer>>();

function load(model: string): Promise<PreTrainedTokenizer> {
  const existing = loaded.get(model);
  if (existing) return existing;
  const p = AutoTokenizer.from_pretrained(model);
  loaded.set(model, p);
  p.catch(() => loaded.delete(model));
  return p;
}

self.onmessage = async (event: MessageEvent<TokenizeMessage>) => {
  const { id, model, text } = event.data;
  try {
    const tok = await load(model);
    const ids = tok.encode(text, { add_special_tokens: false });
    const raw = tok.tokenize(text);
    const pieces = ids.map((t) => tok.decode([t], { clean_up_tokenization_spaces: false }));
    self.postMessage({ id, type: "result", ids, pieces, raw: raw.length === ids.length ? raw : pieces });
  } catch (err) {
    self.postMessage({ id, type: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
