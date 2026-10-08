# ADR-0006: Run Python and AI models in the browser

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

The Lab needs Python, embeddings, tokenizers and an LLM, and paid APIs are ruled out.

## Decision

Use Pyodide for Python and transformers.js for the models (MiniLM embeddings, six tokenizers, Qwen2.5-0.5B-Instruct), each in its own Web Worker. The LLM uses WebGPU with fp32 activations (`q4`), because `q4f16` produced gibberish on long prompts on some GPUs, and falls back to CPU (`q8`).

## Consequences

Zero cost and no keys. First use downloads 10 MB to 800 MB and needs a capable device. Workers keep the UI responsive.
