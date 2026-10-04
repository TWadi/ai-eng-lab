# ai-eng-lab

Our shared workspace for learning AI engineering together: a 40-week track from Python foundations to shipping production LLM apps and agents.

- **Roadmap and progress tracker:** https://claude.ai/artifact/8TcYRRiGVDvEgRSKtFrk5R
- **Start:** Monday 12 October 2026
- **Pace:** 8–10 focused hours per person per week

## Phases

| # | Folder | Weeks | Ship |
|---|--------|-------|------|
| 0 | [00-setup](00-setup/) | 1 | Repo live, both merged a hello-world notebook via reviewed PR |
| 1 | [01-foundations](01-foundations/) | 2–5 | Tested Python CLI + analysis notebook |
| 2 | [02-classical-ml](02-classical-ml/) | 6–10 | Kaggle submission + model comparison report |
| 3 | [03-deep-learning](03-deep-learning/) | 11–17 | Tiny GPT trained on our own corpus |
| 4 | [04-llm-apps](04-llm-apps/) | 18–24 | RAG app over lecture PDFs + eval report |
| 5 | [05-agents-mcp](05-agents-mcp/) | 25–29 | Agent using our own MCP server, with traces |
| 6 | [06-production](06-production/) | 30–34 | Deployed app with CI evals and cost dashboard |
| 7 | [07-capstone](07-capstone/) | 35–40 | Public capstone repo, demo, write-up |

## Layout

```
ai-eng-lab/
├── 00-setup/ … 07-capstone/
│   ├── README.md            goal, checklist, ship criteria for the phase
│   └── <github-username>/   each person's own notebooks and code
├── shared/                  code we both reuse (a real Python package)
├── tests/                   tests for shared/ — run in CI on every PR
├── .env.example             copy to .env, never commit .env
└── pyproject.toml           dependencies, managed with uv
```

Personal work goes in `<phase>/<your-github-username>/`. Code that both of us use moves into `shared/` with tests.

## Getting started

```bash
git clone https://github.com/<owner>/ai-eng-lab.git
cd ai-eng-lab
uv sync                      # creates .venv and installs everything
cp .env.example .env         # then fill in your own keys
uv run python 00-setup/check_env.py
uv run pytest
```

Open notebooks with `uv run jupyter lab`, or in VS Code pick the `.venv` interpreter.

Phase-specific dependencies are installed when that phase starts, for example `uv sync --group ml` in phase 2. See `pyproject.toml`.

## How we work

See [CONTRIBUTING.md](CONTRIBUTING.md) for the weekly rhythm, branch naming and review rules.
