// Turns a photo's CLIP vector into an answer. This is the only place that decides what the app says, and the
// evaluation (eval/dish-accuracy.mjs) runs this same file against the shipped model on the test photos.

export interface Probe {
  model: string;
  dim: number;
  scale: number;
  /** Divides the scores before softmax so that stated confidence matches how often the guess is right. */
  temperature: number;
  /** Below this confidence, the app says it isn't sure instead of naming a dish. */
  threshold: number;
  /** Dish ids, then "other" (something that is not a Filipino dish, or not food at all). */
  classes: string[];
  weights: number[][];
  bias: number[];
}

export interface Guess {
  id: string;
  /** Probability from 0 to 1. */
  p: number;
}

export type Verdict =
  | { kind: "answered"; guesses: Guess[] }
  | { kind: "unsure"; guesses: Guess[] }
  | { kind: "rejected"; guesses: Guess[]; otherP: number };

export function softmax(scores: ArrayLike<number>, temperature = 1): number[] {
  let max = -Infinity;
  for (let i = 0; i < scores.length; i++) max = Math.max(max, scores[i]);
  const e = Array.from(scores, (v) => Math.exp((v - max) / temperature));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

/** `vector` must be unit length (the worker normalises it). */
export function classify(vector: ArrayLike<number>, probe: Probe): Verdict {
  const scores = probe.weights.map((w, c) => {
    let dot = 0;
    for (let i = 0; i < probe.dim; i++) dot += w[i] * vector[i];
    return probe.scale * dot + probe.bias[c];
  });
  const p = softmax(scores, probe.temperature);
  const other = probe.classes.indexOf("other");

  const guesses = p
    .map((value, i) => ({ id: probe.classes[i], p: value }))
    .filter((_, i) => i !== other)
    .sort((a, b) => b.p - a.p)
    .slice(0, 3);

  let top = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[top]) top = i;

  if (top === other) return { kind: "rejected", guesses, otherP: p[other] };
  return { kind: p[top] >= probe.threshold ? "answered" : "unsure", guesses };
}
