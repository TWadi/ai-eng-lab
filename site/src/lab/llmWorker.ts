/// <reference lib="webworker" />
// Runs a small instruction-tuned LLM (Qwen2.5-0.5B-Instruct) in the browser with transformers.js.
// WebGPU when the browser has it (~790 MB download); otherwise CPU via WebAssembly (slower, ~510 MB).
// On WebGPU we use 4-bit weights with fp32 math ("q4"): the smaller fp16 build ("q4f16") produced gibberish
// on longer prompts on some GPUs.
// The weights download from Hugging Face once and are cached by the browser.

import {
  InterruptableStoppingCriteria,
  pipeline,
  TextStreamer,
  type TextGenerationPipeline,
} from "@huggingface/transformers";

export const LLM_ID = "onnx-community/Qwen2.5-0.5B-Instruct";

type Device = "webgpu" | "wasm";

interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

type Incoming =
  | { readonly type: "load"; readonly id: number }
  | { readonly type: "generate"; readonly id: number; readonly messages: readonly ChatMessage[]; readonly maxTokens: number }
  | { readonly type: "stop" };

let generator: Promise<{ pipe: TextGenerationPipeline; device: Device }> | null = null;
const stopper = new InterruptableStoppingCriteria();

async function pickDevice(): Promise<{ device: Device; dtype: "q4" | "q8" }> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (gpu) {
    try {
      if (await gpu.requestAdapter()) return { device: "webgpu", dtype: "q4" };
    } catch {
      // No usable GPU: fall back to the CPU.
    }
  }
  return { device: "wasm", dtype: "q8" };
}

async function create(id: number, device: Device, dtype: "q4" | "q8"): Promise<TextGenerationPipeline> {
  self.postMessage({ id, type: "device", device });
  return (await pipeline("text-generation", LLM_ID, {
    device,
    dtype,
    progress_callback: (p: { status: string; progress?: number }) => {
      if (p.status === "progress_total" && typeof p.progress === "number") {
        self.postMessage({ id, type: "progress", progress: p.progress });
      }
    },
  })) as TextGenerationPipeline;
}

function load(id: number) {
  generator ??= (async () => {
    const { device, dtype } = await pickDevice();
    if (device === "wasm") return { pipe: await create(id, "wasm", "q8"), device };
    try {
      return { pipe: await create(id, device, dtype), device };
    } catch (err) {
      // A GPU that looked usable can still fail to start the model: fall back to the CPU.
      console.warn("WebGPU failed, falling back to WebAssembly", err);
      return { pipe: await create(id, "wasm", "q8"), device: "wasm" as const };
    }
  })();
  generator.catch(() => {
    generator = null;
  });
  return generator;
}

// One model, one generation at a time: requests queue up behind each other.
let queue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<Incoming>) => {
  const msg = event.data;
  if (msg.type === "stop") {
    stopper.interrupt();
    return;
  }
  queue = queue.then(() => handle(msg));
};

async function handle(msg: Exclude<Incoming, { type: "stop" }>): Promise<void> {
  const { id } = msg;
  try {
    const { pipe, device } = await load(id);
    if (msg.type === "load") {
      // Sent on every load (not just the first), so a remounted page still learns the device.
      self.postMessage({ id, type: "ready", device });
      return;
    }
    stopper.reset();
    let text = "";
    const streamer = new TextStreamer(pipe.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (piece: string) => {
        text += piece;
        self.postMessage({ id, type: "token", text });
      },
    });
    await pipe([...msg.messages], {
      max_new_tokens: msg.maxTokens,
      do_sample: false,
      streamer,
      stopping_criteria: stopper,
    });
    self.postMessage({ id, type: "done", text });
  } catch (err) {
    self.postMessage({ id, type: "error", error: err instanceof Error ? err.message : String(err) });
  }
}
