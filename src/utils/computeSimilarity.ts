const dot = (a: number[], b: number[]) =>
  a.reduce((acc, v, i) => acc + v * b[i], 0);

const norm = (a: number[]) => Math.sqrt(a.reduce((s, v) => s + v * v, 0));

/**
 * Cosine similarity of two equal-length embedding vectors.
 * Returns a value in [-1, 1]; higher = more similar.
 */
const computeSimilarity = (a: number[], b: number[]): number => {
  const denom = norm(a) * norm(b);
  if (denom === 0) return 0;
  return dot(a, b) / denom;
};

export default computeSimilarity;
