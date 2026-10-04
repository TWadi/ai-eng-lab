export type Vec = readonly number[];

export function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function norm(a: Vec): number {
  return Math.sqrt(dot(a, a));
}

export function cosine(a: Vec, b: Vec): number {
  const n = norm(a) * norm(b);
  return n === 0 ? 0 : dot(a, b) / n;
}

/** Same rules as the "Chunk text with overlap" challenge. */
export function chunkText(text: string, size: number, overlap: number): string[] {
  if (size <= 0 || overlap < 0 || overlap >= size) throw new Error("Need size > 0 and 0 <= overlap < size");
  if (!text) return [];
  const chunks: string[] = [];
  for (let start = 0; ; start += size - overlap) {
    chunks.push(text.slice(start, start + size));
    if (start + size >= text.length) break;
  }
  return chunks;
}

/** Indices sorted by cosine similarity to the query, best first (ties: lower index). */
export function rank(query: Vec, docs: readonly Vec[]): Array<{ index: number; score: number }> {
  return docs
    .map((d, index) => ({ index, score: cosine(query, d) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

/**
 * Project vectors to 2D with PCA (power iteration on the covariance, then deflation).
 * Good enough for a handful of sentence embeddings; deterministic for a given input.
 */
export function pca2d(vectors: readonly Vec[]): Array<[number, number]> {
  const n = vectors.length;
  if (n === 0) return [];
  const dim = vectors[0].length;
  const mean = new Array<number>(dim).fill(0);
  for (const v of vectors) for (let j = 0; j < dim; j++) mean[j] += v[j] / n;
  const X = vectors.map((v) => v.map((x, j) => x - mean[j]));
  if (n === 1) return [[0, 0]];

  const component = (data: number[][]): number[] => {
    // Start from a fixed, non-degenerate vector so results are stable between runs.
    let w = Array.from({ length: dim }, (_, j) => 1 / Math.sqrt(dim) + (j % 7) * 1e-3);
    for (let iter = 0; iter < 100; iter++) {
      const projected = data.map((row) => dot(row, w));
      const next = new Array<number>(dim).fill(0);
      data.forEach((row, i) => { for (let j = 0; j < dim; j++) next[j] += row[j] * projected[i]; });
      const len = norm(next);
      if (len < 1e-12) return w;
      w = next.map((x) => x / len);
    }
    return w;
  };

  const c1 = component(X);
  const deflated = X.map((row) => {
    const p = dot(row, c1);
    return row.map((x, j) => x - p * c1[j]);
  });
  const c2 = component(deflated);
  return X.map((row) => [dot(row, c1), dot(row, c2)]);
}
