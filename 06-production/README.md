# Phase 6 — Production and LLMOps

**Weeks 30–34** · `uv sync --group llm --group prod`

Turn prototypes into services that are observable, affordable, and safe.

## Checklist

- [ ] [FastAPI](https://fastapi.tiangolo.com): serve your RAG app or agent
- [ ] [Docker](https://docs.docker.com/get-started/): containerise and deploy
- [ ] [Langfuse](https://langfuse.com/docs): tracing, cost and latency per request
- [ ] [OWASP Top 10 for LLMs](https://genai.owasp.org/llm-top-10/): prompt injection, secrets, rate limits
- [ ] [PEFT / LoRA](https://huggingface.co/docs/peft): fine-tune vs RAG vs prompting
- [ ] **Build:** GitHub Actions running tests and evals on every PR

## Ship

Your phase 4 or 5 project deployed, with CI running evals and a cost/latency dashboard.

## Where things go

- Your work: `06-production/<your-github-username>/`
- Anything more than one of you reuses: `shared/` + a test in `tests/`
- Tick items on the [lab website](https://twadi.github.io/ai-engineering-arena/) too
