"""Make a free, local copy of lecture #12's notebook that uses Ollama instead of OpenAI.

Run from the repo root, after cloning the course repo and pulling the two models:

    uv run python rag-course/use_ollama.py

It writes rag-for-beginners/8_multi_modal_rag_ollama.ipynb next to the instructor's notebook,
which stays untouched. Both are in the gitignored course clone.
"""

import json
import sys
from pathlib import Path

import ollama

CHAT_MODEL = "gemma3:4b"  # reads images, like gpt-4o in the original
EMBED_MODEL = "nomic-embed-text"
NUM_CTX = 16384  # room for a chunk's text, tables and images in one prompt

COURSE = Path(__file__).resolve().parent.parent / "rag-for-beginners"
SOURCE = COURSE / "8_multi_modal_rag.ipynb"
TARGET = COURSE / "8_multi_modal_rag_ollama.ipynb"

# (text in the instructor's notebook, replacement, times it must appear)
REPLACEMENTS = [
    (
        "from langchain_openai import ChatOpenAI, OpenAIEmbeddings",
        "from langchain_ollama import ChatOllama, OllamaEmbeddings",
        1,
    ),
    (
        'ChatOpenAI(model="gpt-4o", temperature=0)',
        f'ChatOllama(model="{CHAT_MODEL}", temperature=0, num_ctx={NUM_CTX})',
        2,
    ),
    (
        'OpenAIEmbeddings(model="text-embedding-3-small")',
        f'OllamaEmbeddings(model="{EMBED_MODEL}")',
        1,
    ),
]

HEADER = (
    f"**Local copy using Ollama** (`{CHAT_MODEL}` + `{EMBED_MODEL}`) instead of OpenAI, "
    "made by `rag-course/use_ollama.py`. Keep the Ollama app running while you use it."
)


def convert(notebook: dict) -> dict:
    """Swap OpenAI for Ollama, neutralise the %pip cell and clear the instructor's outputs."""
    counts = [0] * len(REPLACEMENTS)
    for cell in notebook["cells"]:
        source = "".join(cell["source"])
        if cell["cell_type"] == "code":
            if source.lstrip().startswith("%pip install"):
                source = "# Not needed: `uv sync --group rag` already installed everything.\n"
            for i, (old, new, _) in enumerate(REPLACEMENTS):
                counts[i] += source.count(old)
                source = source.replace(old, new)
            cell["outputs"] = []
            cell["execution_count"] = None
        cell["source"] = source.splitlines(keepends=True)

    for (old, _, expected), found in zip(REPLACEMENTS, counts):
        if found != expected:
            sys.exit(f"Expected {old!r} {expected}x but found it {found}x: the notebook changed.")

    header = {"cell_type": "markdown", "id": "use-ollama", "metadata": {}, "source": [HEADER]}
    notebook["cells"].insert(0, header)
    return notebook


def check_ollama() -> None:
    """Warn early: the notebook swallows model errors and silently falls back to raw text."""
    try:
        installed = {m.model for m in ollama.list().models}
    except ConnectionError:
        print("Ollama isn't running: start the Ollama app, then run the notebook.")
        return
    for name in (CHAT_MODEL, EMBED_MODEL):
        if name not in installed and f"{name}:latest" not in installed:
            print(f"Model missing: run `ollama pull {name}`")


def main() -> None:
    if not SOURCE.exists():
        sys.exit(f"{SOURCE} not found: clone the course repo first (see rag-course/README.md).")
    notebook = convert(json.loads(SOURCE.read_text(encoding="utf-8")))
    TARGET.write_text(json.dumps(notebook, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {TARGET.relative_to(COURSE.parent)}")
    check_ollama()


if __name__ == "__main__":
    main()
