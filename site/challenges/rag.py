"""Coding challenges for the RAG course. Pure Python (no numpy) so they load fast in the browser.

Each challenge: id, item (roadmap item it belongs to), title, level (easy/medium/hard), prompt (Markdown-lite),
starter, solution (reference, never shipped to the site) and tests. A test is (name, code, hidden).
Test code runs after the player's code, in the same namespace; failing assertions explain what went wrong.
"""

CHALLENGES = [
    {
        "id": "cosine-similarity",
        "item": "rag-5",
        "title": "Cosine similarity from scratch",
        "level": "easy",
        "prompt": """Write `cosine_similarity(a, b)` for two vectors given as lists of numbers.

cosine(a, b) = dot(a, b) / (|a| x |b|)

Rules:
- Raise `ValueError` if the vectors have different lengths.
- Return `0.0` if either vector is all zeros (instead of dividing by zero).
- No numpy: use plain Python and `math`.""",
        "starter": """import math


def cosine_similarity(a, b):
    # 1. check the lengths match
    # 2. compute the dot product and both lengths (norms)
    # 3. handle zero vectors, then return dot / (norm_a * norm_b)
    raise NotImplementedError
""",
        "solution": """import math


def cosine_similarity(a, b):
    if len(a) != len(b):
        raise ValueError("vectors must have the same length")
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)
""",
        "tests": [
            ("Same direction is 1", "got = cosine_similarity([1, 2], [2, 4])\nassert abs(got - 1) < 1e-9, f'expected 1.0, got {got}'", False),
            ("Perpendicular is 0", "got = cosine_similarity([1, 0], [0, 3])\nassert abs(got) < 1e-9, f'expected 0.0, got {got}'", False),
            ("Opposite is -1", "got = cosine_similarity([1, 1], [-2, -2])\nassert abs(got + 1) < 1e-9, f'expected -1.0, got {got}'", False),
            ("A general case", "got = cosine_similarity([1, 2, 3], [4, 5, 6])\nassert abs(got - 0.9746318461970762) < 1e-9, f'expected about 0.97463, got {got}'", False),
            ("Zero vector gives 0.0", "got = cosine_similarity([0, 0], [1, 2])\nassert got == 0.0, f'expected 0.0, got {got}'", True),
            ("Length mismatch raises ValueError", "try:\n    cosine_similarity([1, 2], [1, 2, 3])\nexcept ValueError:\n    pass\nelse:\n    raise AssertionError('expected a ValueError for different lengths')", True),
        ],
    },
    {
        "id": "chunk-overlap",
        "item": "rag-3",
        "title": "Chunk text with overlap",
        "level": "easy",
        "prompt": """Write `chunk_text(text, size, overlap)` that splits text into character chunks for an ingestion pipeline.

- Each chunk has at most `size` characters.
- Each new chunk starts `size - overlap` characters after the previous one, so neighbours share `overlap` characters.
- Stop as soon as a chunk reaches the end of the text (the last chunk may be shorter).
- Empty text gives `[]`.
- Raise `ValueError` if `overlap >= size` or `size <= 0` (that would never move forward).

Example: `chunk_text("abcdefghij", 4, 1)` gives `["abcd", "defg", "ghij"]`.""",
        "starter": """def chunk_text(text, size, overlap):
    chunks = []
    # Walk through the text, moving forward by (size - overlap) each time.
    return chunks
""",
        "solution": """def chunk_text(text, size, overlap):
    if size <= 0 or overlap >= size or overlap < 0:
        raise ValueError("need size > 0 and 0 <= overlap < size")
    if not text:
        return []
    chunks = []
    start = 0
    while True:
        chunks.append(text[start:start + size])
        if start + size >= len(text):
            break
        start += size - overlap
    return chunks
""",
        "tests": [
            ("Example from the prompt", "got = chunk_text('abcdefghij', 4, 1)\nassert got == ['abcd', 'defg', 'ghij'], f'got {got}'", False),
            ("No overlap", "got = chunk_text('abcdefghij', 5, 0)\nassert got == ['abcde', 'fghij'], f'got {got}'", False),
            ("Text shorter than one chunk", "got = chunk_text('abc', 10, 2)\nassert got == ['abc'], f'got {got}'", False),
            ("Empty text", "got = chunk_text('', 4, 1)\nassert got == [], f'got {got}'", False),
            ("Overlap must be smaller than size", "try:\n    chunk_text('abcdef', 3, 3)\nexcept ValueError:\n    pass\nelse:\n    raise AssertionError('expected ValueError when overlap >= size')", True),
            ("Neighbours share exactly `overlap` characters", "text = 'The quick brown fox jumps over the lazy dog'\nchunks = chunk_text(text, 10, 3)\nassert all(len(c) <= 10 for c in chunks), 'a chunk is longer than size'\nassert all(a[-3:] == b[:3] for a, b in zip(chunks, chunks[1:])), 'neighbours should share 3 characters'\nassert chunks[-1].endswith('dog'), 'the last chunk should reach the end of the text'", True),
        ],
    },
    {
        "id": "top-k",
        "item": "rag-4",
        "title": "Top-k retrieval",
        "level": "medium",
        "prompt": """Write `top_k(query, docs, k)`: the heart of a retriever.

- `query` is a vector, `docs` is a list of vectors (same length as the query).
- Score every doc by cosine similarity to the query.
- Return the best `k` as a list of `(index, score)` tuples, highest score first.
- Break ties by the lower index first.
- If `k` is larger than the number of docs, return all of them.

You will need your own cosine similarity in this file too.""",
        "starter": """import math


def top_k(query, docs, k):
    # score each doc, sort, keep the first k
    return []
""",
        "solution": """import math


def _cos(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return 0.0 if na == 0 or nb == 0 else dot / (na * nb)


def top_k(query, docs, k):
    scored = [(i, _cos(query, d)) for i, d in enumerate(docs)]
    scored.sort(key=lambda t: (-t[1], t[0]))
    return scored[:k]
""",
        "tests": [
            ("Best match first", "got = top_k([1, 0], [[0, 1], [1, 0], [1, 1]], 2)\nassert [i for i, _ in got] == [1, 2], f'expected indices [1, 2], got {got}'", False),
            ("Scores are cosine similarities", "got = top_k([1, 0], [[0, 1], [1, 0], [1, 1]], 3)\nassert abs(got[1][1] - 0.7071067811865475) < 1e-9, f'expected about 0.7071 for [1, 1], got {got}'", False),
            ("k larger than the corpus returns everything", "got = top_k([1, 0], [[1, 0], [0, 1]], 10)\nassert len(got) == 2, f'expected 2 results, got {len(got)}'", False),
            ("Ties go to the lower index", "got = top_k([1, 0], [[2, 0], [5, 0], [0, 1]], 2)\nassert [i for i, _ in got] == [0, 1], f'expected [0, 1] for a tie, got {got}'", True),
            ("Results are (index, score) tuples", "got = top_k([0, 1], [[0, 1]], 1)\nassert isinstance(got[0], tuple) and len(got[0]) == 2, f'expected [(0, 1.0)], got {got}'", True),
        ],
    },
    {
        "id": "precision-recall",
        "item": "rag-14",
        "title": "Precision and recall at k",
        "level": "easy",
        "prompt": """Measure a retriever. Write two functions:

- `precision_at_k(retrieved, relevant, k)`: of the first `k` retrieved ids, the fraction that are relevant.
  Always divide by `k`, even if fewer than `k` ids were retrieved.
- `recall_at_k(retrieved, relevant, k)`: the fraction of all relevant ids found in the first `k` retrieved.
  If there are no relevant ids at all, return `0.0`.

`retrieved` is a ranked list of ids, `relevant` is a set (or list) of ids.""",
        "starter": """def precision_at_k(retrieved, relevant, k):
    return 0.0


def recall_at_k(retrieved, relevant, k):
    return 0.0
""",
        "solution": """def precision_at_k(retrieved, relevant, k):
    relevant = set(relevant)
    hits = sum(1 for r in retrieved[:k] if r in relevant)
    return hits / k


def recall_at_k(retrieved, relevant, k):
    relevant = set(relevant)
    if not relevant:
        return 0.0
    hits = sum(1 for r in retrieved[:k] if r in relevant)
    return hits / len(relevant)
""",
        "tests": [
            ("Precision@3", "got = precision_at_k(['a', 'x', 'b', 'y'], {'a', 'b', 'c'}, 3)\nassert abs(got - 2/3) < 1e-9, f'expected 0.667, got {got}'", False),
            ("Recall@3", "got = recall_at_k(['a', 'x', 'b', 'y'], {'a', 'b', 'c'}, 3)\nassert abs(got - 2/3) < 1e-9, f'expected 0.667, got {got}'", False),
            ("Recall@1", "got = recall_at_k(['a', 'x', 'b'], {'a', 'b'}, 1)\nassert abs(got - 0.5) < 1e-9, f'expected 0.5, got {got}'", False),
            ("Precision divides by k even when fewer are retrieved", "got = precision_at_k(['a'], {'a'}, 4)\nassert abs(got - 0.25) < 1e-9, f'expected 0.25, got {got}'", True),
            ("No relevant ids means recall 0.0", "got = recall_at_k(['a', 'b'], set(), 2)\nassert got == 0.0, f'expected 0.0, got {got}'", True),
        ],
    },
    {
        "id": "rrf",
        "item": "rag-15",
        "title": "Reciprocal rank fusion",
        "level": "medium",
        "prompt": """Combine several ranked lists into one with reciprocal rank fusion (RRF).

`reciprocal_rank_fusion(rankings, k=60)`:
- `rankings` is a list of ranked lists of doc ids (best first).
- A doc's score is the sum over every list it appears in of `1 / (k + rank)`, where `rank` starts at 1.
- Return a list of `(doc_id, score)` sorted by score, highest first; break ties alphabetically by doc id.

Example: `[["a", "b"], ["b", "c"]]` ranks `b` first, because it appears high in both lists.""",
        "starter": """def reciprocal_rank_fusion(rankings, k=60):
    scores = {}
    # add 1 / (k + rank) for every doc in every list
    return []
""",
        "solution": """def reciprocal_rank_fusion(rankings, k=60):
    scores = {}
    for ranking in rankings:
        for rank, doc in enumerate(ranking, start=1):
            scores[doc] = scores.get(doc, 0.0) + 1.0 / (k + rank)
    return sorted(scores.items(), key=lambda t: (-t[1], t[0]))
""",
        "tests": [
            ("Docs in both lists rise to the top", "got = reciprocal_rank_fusion([['a', 'b'], ['b', 'c']])\nassert [d for d, _ in got] == ['b', 'a', 'c'], f'expected order b, a, c, got {got}'", False),
            ("Scores use 1 / (k + rank)", "got = dict(reciprocal_rank_fusion([['a', 'b'], ['b', 'c']]))\nassert abs(got['b'] - (1/62 + 1/61)) < 1e-12, f\"expected b = 1/62 + 1/61, got {got['b']}\"", False),
            ("k is configurable", "got = dict(reciprocal_rank_fusion([['a']], k=0))\nassert abs(got['a'] - 1.0) < 1e-12, f\"expected 1.0 with k=0, got {got['a']}\"", False),
            ("Ties are broken alphabetically", "got = reciprocal_rank_fusion([['b'], ['a']])\nassert [d for d, _ in got] == ['a', 'b'], f'expected a before b on a tie, got {got}'", True),
            ("Empty input", "got = reciprocal_rank_fusion([])\nassert got == [], f'expected [], got {got}'", True),
        ],
    },
    {
        "id": "bm25",
        "item": "rag-16",
        "title": "BM25 keyword scoring",
        "level": "hard",
        "prompt": """Implement the BM25 score used by keyword search.

`bm25_score(query_terms, doc_terms, corpus, k1=1.5, b=0.75)` where every argument is a list of lowercase tokens
(and `corpus` is a list of such documents, including `doc_terms`).

For each *distinct* term t in the query:
- N = number of docs in the corpus, df = number of docs containing t
- idf(t) = ln((N - df + 0.5) / (df + 0.5) + 1)
- tf = how many times t occurs in doc_terms
- avgdl = average document length in the corpus, dl = len(doc_terms)
- term score = idf(t) x tf x (k1 + 1) / (tf + k1 x (1 - b + b x dl / avgdl))

Return the sum of the term scores. Terms that never occur in the doc add 0.""",
        "starter": """import math


def bm25_score(query_terms, doc_terms, corpus, k1=1.5, b=0.75):
    return 0.0
""",
        "solution": """import math


def bm25_score(query_terms, doc_terms, corpus, k1=1.5, b=0.75):
    n = len(corpus)
    avgdl = sum(len(d) for d in corpus) / n
    dl = len(doc_terms)
    score = 0.0
    for term in set(query_terms):
        tf = doc_terms.count(term)
        if tf == 0:
            continue
        df = sum(1 for d in corpus if term in d)
        idf = math.log((n - df + 0.5) / (df + 0.5) + 1)
        score += idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * dl / avgdl))
    return score
""",
        "tests": [
            ("A missing term scores 0", "corpus = [['cat', 'sat'], ['dog', 'ran']]\ngot = bm25_score(['bird'], corpus[0], corpus)\nassert got == 0.0, f'expected 0.0, got {got}'", False),
            ("Exact value for a small corpus", "corpus = [['the', 'cat', 'sat'], ['the', 'dog', 'ran'], ['a', 'cat', 'and', 'a', 'dog']]\ngot = bm25_score(['cat'], corpus[0], corpus)\nassert abs(got - 0.5118851407626823) < 1e-9, f'expected about 0.51189, got {got}'", False),
            ("Rare terms beat common ones", "corpus = [['the', 'rag', 'model'], ['the', 'cat'], ['the', 'dog'], ['the', 'end']]\nrare = bm25_score(['rag'], corpus[0], corpus)\ncommon = bm25_score(['the'], corpus[0], corpus)\nassert rare > common, f'rare term should score higher: rag={rare}, the={common}'", False),
            ("More occurrences score higher", "corpus = [['cat', 'cat', 'x'], ['cat', 'y', 'z'], ['q', 'r', 's']]\nmany = bm25_score(['cat'], corpus[0], corpus)\nfew = bm25_score(['cat'], corpus[1], corpus)\nassert many > few, f'tf=2 should beat tf=1: {many} vs {few}'", True),
            ("Repeated query terms count once", "corpus = [['cat', 'sat'], ['dog', 'ran']]\nonce = bm25_score(['cat'], corpus[0], corpus)\ntwice = bm25_score(['cat', 'cat'], corpus[0], corpus)\nassert abs(once - twice) < 1e-12, f'distinct terms only: {once} vs {twice}'", True),
        ],
    },
    {
        "id": "mmr",
        "item": "rag-13",
        "title": "Maximal marginal relevance",
        "level": "hard",
        "prompt": """Pick results that are relevant *and* different from each other with MMR.

`mmr(query, docs, k, lambda_mult=0.5)` returns a list of `k` doc indices:
1. First pick the doc most similar to the query (cosine similarity).
2. Then repeatedly pick the unpicked doc with the highest
   `lambda_mult x sim(query, doc) - (1 - lambda_mult) x max(sim(doc, picked) for picked docs)`.
3. Break ties by the lower index. Stop at `k` docs (or when none are left).

With `lambda_mult = 1` this is plain top-k; lower values favour diversity.""",
        "starter": """import math


def mmr(query, docs, k, lambda_mult=0.5):
    selected = []
    return selected
""",
        "solution": """import math


def _cos(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return 0.0 if na == 0 or nb == 0 else dot / (na * nb)


def mmr(query, docs, k, lambda_mult=0.5):
    selected = []
    remaining = list(range(len(docs)))
    while remaining and len(selected) < k:
        def value(i):
            rel = _cos(query, docs[i])
            if not selected:
                return rel
            red = max(_cos(docs[i], docs[s]) for s in selected)
            return lambda_mult * rel - (1 - lambda_mult) * red
        best = max(remaining, key=lambda i: (value(i), -i))
        selected.append(best)
        remaining.remove(best)
    return selected
""",
        "tests": [
            ("Starts with the most relevant doc", "got = mmr([1, 0.2], [[1, 0], [0.99, 0.1], [0.7, 0.7]], 1)\nassert got == [1], f'expected [1] (closest to the query), got {got}'", False),
            ("Skips the near-duplicate", "got = mmr([1, 0.2], [[1, 0], [0.99, 0.1], [0.7, 0.7]], 2)\nassert got == [1, 2], f'expected [1, 2]: doc 0 is almost the same as doc 1, got {got}'", False),
            ("lambda_mult = 1 is plain relevance order", "got = mmr([1, 0.2], [[1, 0], [0.99, 0.1], [0.7, 0.7]], 3, lambda_mult=1.0)\nassert got == [1, 0, 2], f'expected [1, 0, 2], got {got}'", False),
            ("Stops when docs run out", "got = mmr([1, 0], [[1, 0], [0, 1]], 5)\nassert sorted(got) == [0, 1] and len(got) == 2, f'expected both docs once, got {got}'", True),
        ],
    },
    {
        "id": "recursive-split",
        "item": "rag-9",
        "title": "Recursive text splitter",
        "level": "hard",
        "prompt": """Build a simple version of LangChain's recursive splitter.

`recursive_split(text, chunk_size, separators=("\\n\\n", "\\n", " ", ""))` returns a list of pieces:
1. Use the first separator in the list that appears in the text (the empty string `""` always "appears").
2. Split the text on it and drop empty pieces.
3. Any piece longer than `chunk_size` is split again, recursively, with the *remaining* separators.
4. The `""` separator means: cut into slices of exactly `chunk_size` characters (the last may be shorter).

Pieces are not merged back together here, and separators are not kept.""",
        "starter": """def recursive_split(text, chunk_size, separators=("\\n\\n", "\\n", " ", "")):
    return [text]
""",
        "solution": """def recursive_split(text, chunk_size, separators=("\\n\\n", "\\n", " ", "")):
    if len(text) <= chunk_size:
        return [text] if text else []
    for i, sep in enumerate(separators):
        if sep == "":
            return [text[j:j + chunk_size] for j in range(0, len(text), chunk_size)]
        if sep in text:
            out = []
            for piece in text.split(sep):
                if not piece:
                    continue
                if len(piece) <= chunk_size:
                    out.append(piece)
                else:
                    out.extend(recursive_split(piece, chunk_size, separators[i + 1:]))
            return out
    return [text[j:j + chunk_size] for j in range(0, len(text), chunk_size)]
""",
        "tests": [
            ("Short text stays whole", "got = recursive_split('hello', 10)\nassert got == ['hello'], f'got {got}'", False),
            ("Paragraphs first", "got = recursive_split('one two\\n\\nthree four', 10)\nassert got == ['one two', 'three four'], f'got {got}'", False),
            ("Falls back to spaces for long paragraphs", "got = recursive_split('alpha beta gamma\\n\\nok', 10)\nassert got == ['alpha', 'beta', 'gamma', 'ok'], f'got {got}'", False),
            ("Character slices as the last resort", "got = recursive_split('abcdefghij', 4)\nassert got == ['abcd', 'efgh', 'ij'], f'got {got}'", False),
            ("Every piece fits", "text = 'Retrieval augmented generation\\ncombines search\\n\\nwith generation. Supercalifragilistic words get sliced.'\ngot = recursive_split(text, 12)\nassert got and all(0 < len(p) <= 12 for p in got), f'pieces must be 1..12 chars, got {got}'", True),
            ("Empty text", "got = recursive_split('', 5)\nassert got == [], f'got {got}'", True),
        ],
    },
]
