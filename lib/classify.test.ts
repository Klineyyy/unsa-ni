import { describe, expect, it } from "vitest";
import { classify, softmax, type Probe } from "./classify";

// Three classes in two dimensions: "a" points along x, "b" along y, and "other" is the middle.
const probe: Probe = {
  model: "test", dim: 2, scale: 10, temperature: 1, threshold: 0.6,
  classes: ["a", "b", "other"],
  weights: [[1, 0], [0, 1], [0.6, 0.6]],
  bias: [0, 0, 0],
};

describe("softmax", () => {
  it("sums to one and keeps the order", () => {
    const p = softmax([1, 3, 2]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(p[1]).toBeGreaterThan(p[2]);
  });

  it("a higher temperature spreads the probabilities out", () => {
    expect(softmax([1, 3], 4)[1]).toBeLessThan(softmax([1, 3], 1)[1]);
  });

  it("does not overflow on large scores", () => {
    expect(softmax([1000, 1001]).every(Number.isFinite)).toBe(true);
  });
});

describe("classify", () => {
  it("names a dish when it is confident", () => {
    const v = classify([1, 0], probe);
    expect(v.kind).toBe("answered");
    expect(v.guesses[0].id).toBe("a");
    expect(v.guesses[0].p).toBeGreaterThan(0.6);
  });

  it("says it isn't sure when the top guess is below the threshold", () => {
    // "a" and "b" score the same, so each gets about half; "other" scores far lower
    const v = classify([0.7071, 0.7071], { ...probe, weights: [[1, 0], [0, 1], [0, 0]], threshold: 0.9 });
    expect(v.kind).toBe("unsure");
    expect(v.guesses[0].p).toBeLessThan(0.9);
  });

  it("says 'not a dish' when the 'other' class wins, and still lists the best dish guesses", () => {
    const v = classify([0.7071, 0.7071], probe);
    expect(v.kind).toBe("rejected");
    expect(v.guesses.map((g) => g.id)).not.toContain("other");
    expect(v.guesses).toHaveLength(2);
  });

  it("returns at most three guesses, best first", () => {
    const big: Probe = { ...probe, classes: ["a", "b", "c", "d", "other"], weights: [[1, 0], [0.9, 0.1], [0.5, 0.5], [0.1, 0.9], [0, 0]], bias: [0, 0, 0, 0, 0] };
    const g = classify([1, 0], big).guesses;
    expect(g).toHaveLength(3);
    expect(g[0].p).toBeGreaterThanOrEqual(g[1].p);
    expect(g[1].p).toBeGreaterThanOrEqual(g[2].p);
  });
});
