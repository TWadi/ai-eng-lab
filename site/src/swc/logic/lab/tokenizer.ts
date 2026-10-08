export interface TokenizerInfo {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  /** Who uses it, in a few words. */
  readonly usedBy: string;
}

/** Tokenizer files only (0.7 to 10 MB each), downloaded from Hugging Face on first use and cached by the browser. */
export const TOKENIZERS: readonly TokenizerInfo[] = [
  { id: "Xenova/gpt-4o", name: "GPT-4o", kind: "Byte-level BPE, 200k vocab", usedBy: "GPT-4o, o1, o3" },
  { id: "Xenova/gpt-4", name: "GPT-4", kind: "Byte-level BPE, 100k vocab", usedBy: "GPT-4, GPT-3.5, text-embedding-3" },
  { id: "Xenova/gpt2", name: "GPT-2", kind: "Byte-level BPE, 50k vocab", usedBy: "GPT-2 (Karpathy's tokenizer video)" },
  { id: "onnx-community/Qwen2.5-0.5B-Instruct", name: "Qwen2.5", kind: "Byte-level BPE, 151k vocab", usedBy: "The Lab's local LLM" },
  { id: "Xenova/bert-base-uncased", name: "BERT", kind: "WordPiece, 30k vocab", usedBy: "BERT, many embedding models" },
  { id: "Xenova/t5-small", name: "T5", kind: "SentencePiece (Unigram), 32k vocab", usedBy: "T5, Flan-T5" },
];

export interface Tokenized {
  readonly ids: readonly number[];
  /** Each token decoded back to text (may show � for a token that is part of a multi-byte character). */
  readonly pieces: readonly string[];
  /** Each token as stored in the vocabulary (e.g. "Ġhello" for " hello" in GPT-2). */
  readonly raw: readonly string[];
}

/** Make whitespace visible inside a token chip. */
export function showWhitespace(piece: string): string {
  return piece.replace(/ /g, "·").replace(/\n/g, "↵").replace(/\t/g, "→");
}

/** Average characters per token (higher = the tokenizer packs this text more efficiently). */
export function charsPerToken(text: string, tokens: number): number {
  return tokens === 0 ? 0 : [...text].length / tokens;
}
