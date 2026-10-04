// The 40-week roadmap. Item ids are stored in the database (progress.item_id),
// so never rename an existing id; add new ones instead.

export type ItemKind = "learn" | "build" | "setup";

export interface RoadmapItem {
  readonly id: string;
  readonly kind: ItemKind;
  readonly title: string;
  readonly url?: string;
  readonly source?: string;
}

export interface Phase {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly weeks: readonly [number, number];
  readonly goal: string;
  readonly ship: string;
  readonly items: readonly RoadmapItem[];
}

export const START_DATE = new Date("2026-10-12T00:00:00");
export const TOTAL_WEEKS = 40;

export const PHASES: readonly Phase[] = [
  {
    id: "p0", code: "phase_00", title: "Lab setup", weeks: [1, 1],
    goal: "Get the shared infrastructure running so the next 39 weeks are about learning, not tooling.",
    ship: "Repo is live and both of you have merged a hello-world notebook through a reviewed PR.",
    items: [
      { id: "p0-1", kind: "build", title: "Clone ai-eng-lab, run uv sync and the env check script" },
      { id: "p0-2", kind: "setup", title: "Install Python 3.12, uv, VS Code + Jupyter, Git", url: "https://docs.astral.sh/uv/", source: "uv docs" },
      { id: "p0-3", kind: "setup", title: "Create accounts: GitHub, Hugging Face, Kaggle, Google Colab, Anthropic Console (set a spend limit)" },
      { id: "p0-4", kind: "learn", title: "The Missing Semester: shell, editors, version control", url: "https://missing.csail.mit.edu", source: "MIT" },
      { id: "p0-5", kind: "setup", title: "Agree on the weekly rhythm and calendar the Thursday pair session" },
    ],
  },
  {
    id: "p1", code: "phase_01", title: "Foundations: Python, data, math", weeks: [2, 5],
    goal: "Write clean Python comfortably, wrangle data, and build the math intuition ML is made of.",
    ship: "A tested Python CLI plus an analysis notebook with at least three charts and written conclusions.",
    items: [
      { id: "p1-1", kind: "learn", title: "Python fluency: functions, classes, type hints, modules", url: "https://docs.python.org/3/tutorial/", source: "Python tutorial" },
      { id: "p1-2", kind: "learn", title: "pytest basics: test your own functions", url: "https://docs.pytest.org/en/stable/getting-started.html", source: "pytest" },
      { id: "p1-3", kind: "learn", title: "NumPy and pandas: arrays, broadcasting, groupby, joins", url: "https://www.kaggle.com/learn/pandas", source: "Kaggle Learn" },
      { id: "p1-4", kind: "learn", title: "Essence of Linear Algebra", url: "https://www.3blue1brown.com/topics/linear-algebra", source: "3Blue1Brown" },
      { id: "p1-5", kind: "learn", title: "Essence of Calculus: derivatives and the chain rule", url: "https://www.3blue1brown.com/topics/calculus", source: "3Blue1Brown" },
      { id: "p1-6", kind: "learn", title: "Probability and statistics basics", url: "https://www.khanacademy.org/math/statistics-probability", source: "Khan Academy" },
      { id: "p1-7", kind: "build", title: "CLI that pulls data from a public API, analyses it with pandas, and has tests" },
    ],
  },
  {
    id: "p2", code: "phase_02", title: "Classical machine learning", weeks: [6, 10],
    goal: "Understand how models learn, how to evaluate them honestly, and when simple models win.",
    ship: "Kaggle submission plus a report comparing models, with the leakage traps you avoided.",
    items: [
      { id: "p2-1", kind: "learn", title: "Machine Learning Specialization, courses 1 and 2", url: "https://www.coursera.org/specializations/machine-learning-introduction", source: "Andrew Ng · Coursera" },
      { id: "p2-2", kind: "learn", title: "Intro and Intermediate Machine Learning", url: "https://www.kaggle.com/learn/intro-to-machine-learning", source: "Kaggle Learn" },
      { id: "p2-3", kind: "learn", title: "scikit-learn: pipelines, cross-validation, metrics", url: "https://scikit-learn.org/stable/user_guide.html", source: "scikit-learn" },
      { id: "p2-4", kind: "learn", title: "Explain to each other: bias/variance, overfitting, leakage, precision/recall" },
      { id: "p2-5", kind: "build", title: "Kaggle Titanic, then House Prices: compare at least three models" },
    ],
  },
  {
    id: "p3", code: "phase_03", title: "Deep learning and transformers", weeks: [11, 17],
    goal: "Build neural networks from scratch until a GPT is no longer magic.",
    ship: "Your own small GPT trained end to end, plus a write-up explaining attention.",
    items: [
      { id: "p3-1", kind: "learn", title: "Neural networks series", url: "https://www.3blue1brown.com/topics/neural-networks", source: "3Blue1Brown" },
      { id: "p3-2", kind: "learn", title: "PyTorch: tensors, autograd, datasets, training loop", url: "https://pytorch.org/tutorials/beginner/basics/intro.html", source: "PyTorch" },
      { id: "p3-3", kind: "learn", title: "Zero to Hero: micrograd and makemore 1–5", url: "https://karpathy.ai/zero-to-hero.html", source: "Karpathy" },
      { id: "p3-4", kind: "learn", title: "Zero to Hero: Let's build GPT + the GPT tokenizer", url: "https://karpathy.ai/zero-to-hero.html", source: "Karpathy" },
      { id: "p3-5", kind: "learn", title: "The Illustrated Transformer", url: "https://jalammar.github.io/illustrated-transformer/", source: "Jay Alammar" },
      { id: "p3-6", kind: "learn", title: "Optional: Practical Deep Learning, lessons 1–4", url: "https://course.fast.ai", source: "fast.ai" },
      { id: "p3-7", kind: "build", title: "Train a tiny GPT on your own text corpus on Colab" },
    ],
  },
  {
    id: "p4", code: "phase_04", title: "LLM application engineering", weeks: [18, 24],
    goal: "Build reliable products on foundation models: prompting, structured output, RAG, evals.",
    ship: "A study-buddy RAG app with citations and an eval report showing how each change moved the score.",
    items: [
      { id: "p4-1", kind: "learn", title: "Prompt engineering interactive tutorial", url: "https://github.com/anthropics/prompt-eng-interactive-tutorial", source: "Anthropic" },
      { id: "p4-2", kind: "learn", title: "Claude API: messages, streaming, structured outputs, tool use, caching", url: "https://docs.claude.com", source: "Claude docs" },
      { id: "p4-3", kind: "learn", title: "LLM Course chapters 1–4", url: "https://huggingface.co/learn/llm-course", source: "Hugging Face" },
      { id: "p4-4", kind: "learn", title: "Embeddings and vector search with Postgres + pgvector", url: "https://github.com/pgvector/pgvector", source: "pgvector" },
      { id: "p4-5", kind: "learn", title: "Read: AI Engineering, chapters 1–6", source: "Chip Huyen · O'Reilly" },
      { id: "p4-6", kind: "learn", title: "Evals: 50-question test set, score retrieval and answers", url: "https://hamel.dev/blog/posts/evals/", source: "Hamel Husain" },
      { id: "p4-7", kind: "build", title: "RAG app over your lecture PDFs with cited answers" },
    ],
  },
  {
    id: "p5", code: "phase_05", title: "Agents and MCP", weeks: [25, 29],
    goal: "Give models tools and let them act, with loops you understand and can debug.",
    ship: "An agent that completes a multi-step task through your MCP server, with replayable traces.",
    items: [
      { id: "p5-1", kind: "learn", title: "Read: Building effective agents", url: "https://www.anthropic.com/engineering/building-effective-agents", source: "Anthropic" },
      { id: "p5-2", kind: "build", title: "Agent loop from scratch, no framework" },
      { id: "p5-3", kind: "learn", title: "Model Context Protocol: servers, tools, resources", url: "https://modelcontextprotocol.io", source: "MCP docs" },
      { id: "p5-4", kind: "build", title: "Your own MCP server (timetable, notes, test reports…)" },
      { id: "p5-5", kind: "learn", title: "Claude Agent SDK and Claude Code: subagents, hooks, skills", url: "https://docs.claude.com/en/docs/agent-sdk/overview", source: "Claude docs" },
      { id: "p5-6", kind: "learn", title: "Patterns: orchestrator–workers, evaluator–optimizer, human-in-the-loop" },
    ],
  },
  {
    id: "p6", code: "phase_06", title: "Production and LLMOps", weeks: [30, 34],
    goal: "Turn prototypes into services that are observable, affordable, and safe.",
    ship: "Your phase 4 or 5 project deployed, with CI running evals and a cost/latency dashboard.",
    items: [
      { id: "p6-1", kind: "learn", title: "FastAPI: serve your RAG app or agent", url: "https://fastapi.tiangolo.com", source: "FastAPI" },
      { id: "p6-2", kind: "learn", title: "Docker: containerise and deploy", url: "https://docs.docker.com/get-started/", source: "Docker" },
      { id: "p6-3", kind: "learn", title: "Observability: tracing, cost and latency per request", url: "https://langfuse.com/docs", source: "Langfuse" },
      { id: "p6-4", kind: "learn", title: "OWASP Top 10 for LLMs: prompt injection, secrets, rate limits", url: "https://genai.owasp.org/llm-top-10/", source: "OWASP" },
      { id: "p6-5", kind: "learn", title: "LoRA fine-tuning; fine-tune vs RAG vs prompting", url: "https://huggingface.co/docs/peft", source: "Hugging Face PEFT" },
      { id: "p6-6", kind: "build", title: "GitHub Actions running tests and evals on every PR" },
    ],
  },
  {
    id: "p7", code: "phase_07", title: "Capstone", weeks: [35, 40],
    goal: "Solve one real problem together and package it as the centrepiece of both portfolios.",
    ship: "A public capstone repo, live demo, and write-up you can both point to in interviews.",
    items: [
      { id: "p7-1", kind: "build", title: "Pick a real problem and write a one-page PRD" },
      { id: "p7-2", kind: "build", title: "Split ownership (infra/backend vs model/evals), swap reviews" },
      { id: "p7-3", kind: "build", title: "Eval suite with a baseline and an agreed target" },
      { id: "p7-4", kind: "build", title: "Deploy and record a 3-minute demo" },
      { id: "p7-5", kind: "build", title: "Write it up on GitHub and LinkedIn" },
    ],
  },
];

export const ALL_ITEM_IDS: readonly string[] = PHASES.flatMap((p) => p.items.map((i) => i.id));
