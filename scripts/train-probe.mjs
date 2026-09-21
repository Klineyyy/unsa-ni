// Trains a small classifier on top of CLIP's photo vectors and writes it to public/model/probe.json.
//
//   node scripts/train-probe.mjs
//
// The classifier starts as CLIP's own zero-shot guess (the average of each dish's text prompts) and is nudged
// by the training photos; a penalty keeps it from wandering far from that start. Hyper-parameters are chosen on
// the validation photos. The test photos are looked at once, at the end.
import { readFile, writeFile } from "node:fs/promises";

const cache = JSON.parse(await readFile(".cache/clip-clip-vit-base-patch32.json", "utf8"));
const dishes = JSON.parse(await readFile("data/dishes.json", "utf8")).map((d) => d.id);
const classes = [...dishes, "other"];
const OTHER = classes.length - 1;
const D = cache.images[Object.keys(cache.images)[0]].length;
const SCALE = 100;
const manifest = JSON.parse(await readFile("data/images.json", "utf8")).filter((x) => cache.images[x.pageid]);
const dropped = new Set(cache.reviewedOut);
const cls = (x) => (x.dish.startsWith("other-") ? OTHER : dishes.indexOf(x.dish));

const unit = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
const meanUnit = (rows) => unit(rows[0].map((_, i) => rows.reduce((s, r) => s + r[i], 0) / rows.length));
const W0 = classes.map((c) => Float64Array.from(meanUnit(cache.prompts[c])));

const dot = (a, b) => { let s = 0; for (let i = 0; i < D; i++) s += a[i] * b[i]; return s; };
const zsLogits = (x) => W0.map((w) => SCALE * dot(w, x));
const softmax = (z, T = 1) => { const m = Math.max(...z); const e = z.map((v) => Math.exp((v - m) / T)); const s = e.reduce((a, b) => a + b, 0); return e.map((v) => v / s); };
const rankOf = (z, k) => z.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).findIndex(([, i]) => i === k) + 1;

// ---- data ------------------------------------------------------------------------------------------
const items = (split) => manifest.filter((x) => x.split === split && !(split === "test" && dropped.has(x.pageid))).map((x) => ({ x: Float64Array.from(cache.images[x.pageid]), y: cls(x), page: x.pageid }));
const test = items("test");
// Category labels on Commons are noisy (a dish's category holds signs, stages and raw ingredients), so training
// and validation dish photos are kept only if CLIP's own guess puts the labelled dish in its top 5.
const clean = (list) => list.filter((s) => s.y === OTHER || rankOf(zsLogits(s.x), s.y) <= 5);
const train = clean(items("train"));
const val = clean(items("val"));
console.log(`train ${train.length}/${items("train").length} kept, val ${val.length}/${items("val").length} kept, test ${test.length} (reviewed by eye)`);

// ---- training --------------------------------------------------------------------------------------
function fit({ lambda, epochs, wOther }) {
  const W = W0.map((w) => Float64Array.from(w));
  const b = new Float64Array(classes.length);
  const mW = W.map(() => new Float64Array(D)), vW = W.map(() => new Float64Array(D));
  const mB = new Float64Array(classes.length), vB = new Float64Array(classes.length);
  const wt = train.map((s) => (s.y === OTHER ? wOther : 1));
  const total = wt.reduce((a, c) => a + c, 0);
  const lr = 1e-3, lrB = 0.02;
  for (let t = 1; t <= epochs; t++) {
    const gW = W.map(() => new Float64Array(D));
    const gB = new Float64Array(classes.length);
    train.forEach((s, n) => {
      const p = softmax(W.map((w, c) => SCALE * dot(w, s.x) + b[c]));
      for (let c = 0; c < classes.length; c++) {
        const g = (p[c] - (c === s.y ? 1 : 0)) * wt[n] / total;
        gB[c] += g;
        const gc = gW[c];
        const k = SCALE * g;
        for (let i = 0; i < D; i++) gc[i] += k * s.x[i];
      }
    });
    for (let c = 0; c < classes.length; c++) {
      for (let i = 0; i < D; i++) {
        const g = gW[c][i] + 2 * lambda * (W[c][i] - W0[c][i]);
        mW[c][i] = 0.9 * mW[c][i] + 0.1 * g; vW[c][i] = 0.999 * vW[c][i] + 0.001 * g * g;
        W[c][i] -= lr * (mW[c][i] / (1 - 0.9 ** t)) / (Math.sqrt(vW[c][i] / (1 - 0.999 ** t)) + 1e-8);
      }
      mB[c] = 0.9 * mB[c] + 0.1 * gB[c]; vB[c] = 0.999 * vB[c] + 0.001 * gB[c] ** 2;
      b[c] -= lrB * (mB[c] / (1 - 0.9 ** t)) / (Math.sqrt(vB[c] / (1 - 0.999 ** t)) + 1e-8);
    }
  }
  return { W, b };
}
const logitsOf = (m, x) => m.W.map((w, c) => SCALE * dot(w, x) + m.b[c]);
const top1 = (list, f) => list.filter((s) => rankOf(f(s.x), s.y) === 1).length / list.length;

// ---- choose hyper-parameters on validation ---------------------------------------------------------
const grid = [];
for (const lambda of [0, 1e-4, 1e-3, 1e-2, 1e-1]) for (const epochs of [60, 200]) for (const wOther of [0.1, 0.3]) grid.push({ lambda, epochs, wOther });
let best = null;
console.log("\nvalidation (top-1 over all 36 classes) for each setting:");
for (const g of grid) {
  const m = fit(g);
  const acc = top1(val, (x) => logitsOf(m, x));
  console.log(`  lambda ${String(g.lambda).padEnd(6)} epochs ${String(g.epochs).padEnd(3)} other-weight ${g.wOther}  ->  ${(100 * acc).toFixed(1)}%`);
  if (!best || acc > best.acc) best = { ...g, acc, m };
}
console.log(`\nchosen: lambda ${best.lambda}, ${best.epochs} epochs, other-weight ${best.wOther} (val ${(100 * best.acc).toFixed(1)}%)`);
console.log(`zero-shot on the same val photos: ${(100 * top1(val, zsLogits)).toFixed(1)}%`);

// temperature so that stated confidence is honest, fitted on validation
const nll = (T) => -val.reduce((s, v) => s + Math.log(softmax(logitsOf(best.m, v.x), T)[v.y] + 1e-12), 0) / val.length;
let T = 1, bestNll = nll(1);
for (let t = 0.5; t <= 6; t += 0.1) { const v = nll(t); if (v < bestNll) { bestNll = v; T = t; } }
console.log(`temperature ${T.toFixed(1)} (validation NLL ${nll(1).toFixed(3)} -> ${bestNll.toFixed(3)})`);

// What the app does with a photo:
//   - the top guess is "other"            -> "that doesn't look like a Filipino dish"
//   - the top guess is a dish, confident  -> names the dish (and shows the next two guesses)
//   - the top guess is a dish, not sure   -> "not sure", showing its top three guesses
const TAU = 0.4;
const decide = (m, x, delta) => {
  const z = logitsOf(m, x); z[OTHER] += delta;
  const p = softmax(z, T);
  const top = p.indexOf(Math.max(...p));
  return { top, conf: p[top], kind: top === OTHER ? "rejected" : p[top] >= TAU ? "answered" : "unsure", z, p };
};
const outcomes = (m, list, delta) => {
  const o = { right: 0, wrong: 0, unsure: 0, unsureButInTop3: 0, rejected: 0, n: list.length };
  for (const s of list) {
    const d = decide(m, s.x, delta);
    if (s.y === OTHER) { o[d.kind === "rejected" ? "rejected" : d.kind === "answered" ? "wrong" : "unsure"]++; continue; }
    if (d.kind === "rejected") o.rejected++;
    else if (d.kind === "answered") o[d.top === s.y ? "right" : "wrong"]++;
    else { o.unsure++; if (rankOf(d.z, s.y) <= 3) o.unsureButInTop3++; }
  }
  return o;
};
const pc = (n, d) => `${(100 * n / d).toFixed(0).padStart(3)}%`;
const valDish = val.filter((s) => s.y !== OTHER), valOther = val.filter((s) => s.y === OTHER);

// pick the "other" bias on validation: fewest bad outcomes = a dish rejected or confidently misnamed,
// plus a non-dish confidently named as a dish
let delta = 0, bestBad = Infinity;
console.log('\nvalidation: choosing the "other" bias (bad = a dish rejected or misnamed, or a non-dish named as a dish)');
for (let d = -6; d <= 4; d++) {
  const a = outcomes(best.m, valDish, d), o = outcomes(best.m, valOther, d);
  const bad = (a.rejected + a.wrong) / a.n + o.wrong / o.n;
  console.log(`  bias ${String(d).padStart(2)}: dishes rejected ${pc(a.rejected, a.n)}  dishes misnamed ${pc(a.wrong, a.n)}  non-dishes named as dishes ${pc(o.wrong, o.n)}   bad = ${bad.toFixed(2)}`);
  if (bad < bestBad) { bestBad = bad; delta = d; }
}
best.m.b[OTHER] += delta;
console.log(`chosen bias: ${delta}`);

// ---- final numbers on the test photos --------------------------------------------------------------
const dishTest = test.filter((s) => s.y !== OTHER), otherTest = test.filter((s) => s.y === OTHER);
const stat = (name, f) => {
  const r = dishTest.map((s) => rankOf(f(s.x), s.y));
  const at = (k) => (100 * r.filter((v) => v <= k).length / r.length).toFixed(0);
  const wrongReject = (100 * dishTest.filter((s) => softmax(f(s.x)).indexOf(Math.max(...softmax(f(s.x)))) === OTHER).length / dishTest.length).toFixed(0);
  const okOther = (100 * otherTest.filter((s) => { const p = softmax(f(s.x)); return p.indexOf(Math.max(...p)) === OTHER; }).length / otherTest.length).toFixed(0);
  console.log(`${name.padEnd(12)} dish photos (n=${dishTest.length}): top-1 ${at(1)}%  top-3 ${at(3)}%  top-5 ${at(5)}%  called "other" by mistake ${wrongReject}%   |   other photos (n=${otherTest.length}): recognised as other ${okOther}%`);
};
console.log("\nTEST (36 classes: 35 dishes + other)");
stat("zero-shot", zsLogits);
stat("trained", (x) => logitsOf(best.m, x));

console.log(`\nTEST, with the app's decision rule (confident = ${TAU}):`);
const od = outcomes(best.m, dishTest, 0), oo = outcomes(best.m, otherTest, 0);
console.log(`  dish photos (n=${od.n}):  named correctly ${pc(od.right, od.n)}  | misnamed ${pc(od.wrong, od.n)}  | "not sure" ${pc(od.unsure, od.n)} (right dish in its top 3 ${pc(od.unsureButInTop3, od.unsure || 1)} of those)  | called not-a-dish ${pc(od.rejected, od.n)}`);
console.log(`  other photos (n=${oo.n}): called not-a-dish ${pc(oo.rejected, oo.n)}  | "not sure" ${pc(oo.unsure, oo.n)}  | named as a dish ${pc(oo.wrong, oo.n)}`);
const answered = od.right + od.wrong;
console.log(`  when it names a dish, it is right ${pc(od.right, answered)} of the time (${pc(answered, od.n)} of dish photos get a name)`);

await writeFile("public/model/probe.json", JSON.stringify({
  model: cache.model, dim: D, scale: SCALE, temperature: Number(T.toFixed(2)), threshold: TAU, classes,
  weights: best.m.W.map((w) => Array.from(w, (v) => Math.round(v * 1e4) / 1e4)),
  bias: Array.from(best.m.b, (v) => Math.round(v * 1e4) / 1e4),
}));
console.log("\nWrote public/model/probe.json");
