// How well does the shipped model do? Runs the exact files the app uses (public/model/probe.json and
// lib/classify.ts) over the test photos, which were never used for training or for choosing any setting.
//
//   node eval/dish-accuracy.mjs
//
// The test photos are the ones I looked at by eye and kept (data/reviewed-out.json lists the ones I dropped).
// Photographers never appear in more than one of train / validation / test (see scripts/collect-images.mjs).
import { readFile } from "node:fs/promises";
import { classify } from "../lib/classify.ts";

const cache = JSON.parse(await readFile(".cache/clip-clip-vit-base-patch32.json", "utf8"));
const probe = JSON.parse(await readFile("public/model/probe.json", "utf8"));
const dishes = JSON.parse(await readFile("data/dishes.json", "utf8")).map((d) => d.id);
const manifest = JSON.parse(await readFile("data/images.json", "utf8")).filter((x) => cache.images[x.pageid] && x.split === "test");
const dropped = new Set(cache.reviewedOut);
const test = manifest.filter((x) => !dropped.has(x.pageid));
const isOther = (x) => x.dish.startsWith("other-");
const dishTest = test.filter((x) => !isOther(x)), otherTest = test.filter(isOther);
if (probe.classes.slice(0, -1).join() !== dishes.join()) throw new Error("probe.json and data/dishes.json disagree about the dishes");

const pc = (n, d) => `${((100 * n) / d).toFixed(0)}%`;
const results = dishTest.map((x) => ({ x, v: classify(cache.images[x.pageid], probe) }));
const others = otherTest.map((x) => ({ x, v: classify(cache.images[x.pageid], probe) }));

const top = (k) => results.filter(({ x, v }) => v.guesses.slice(0, k).some((g) => g.id === x.dish)).length;
console.log(`model ${probe.model}, ${dishes.length} dishes, chance ${(100 / dishes.length).toFixed(1)}%\n`);
console.log(`Filipino dish photos (n=${dishTest.length}, from ${new Set(dishTest.map((x) => x.artist)).size} photographers)`);
console.log(`  right dish is the top guess ${pc(top(1), dishTest.length)}, in the top 3 ${pc(top(3), dishTest.length)}`);

const answered = results.filter((r) => r.v.kind === "answered");
const right = answered.filter((r) => r.v.guesses[0].id === r.x.dish).length;
const unsure = results.filter((r) => r.v.kind === "unsure");
const rejected = results.filter((r) => r.v.kind === "rejected");
console.log(`  what the app says:  names the dish ${pc(answered.length, dishTest.length)} (right ${pc(right, answered.length)} of those)  |  "not sure" ${pc(unsure.length, dishTest.length)}  |  "not a dish" ${pc(rejected.length, dishTest.length)}`);
console.log(`  when "not sure", the right dish is among its 3 guesses ${pc(unsure.filter(({ x, v }) => v.guesses.some((g) => g.id === x.dish)).length, unsure.length)} of the time`);

console.log(`\nPhotos that are not a Filipino dish (n=${otherTest.length}: other foods, animals, cars, people, landscapes)`);
const o = (k) => others.filter((r) => r.v.kind === k).length;
console.log(`  "not a dish" ${pc(o("rejected"), others.length)}  |  "not sure" ${pc(o("unsure"), others.length)}  |  named as a Filipino dish ${pc(o("answered"), others.length)}`);

const per = {};
for (const { x, v } of results) { const c = (per[x.dish] ??= { n: 0, ok: 0 }); c.n++; if (v.guesses[0].id === x.dish) c.ok++; }
const low = Object.entries(per).filter(([, c]) => c.n >= 4).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
console.log(`\ndishes with 4 or more test photos, weakest first (top guess right / photos):`);
console.log("  " + low.slice(0, 8).map(([d, c]) => `${d} ${c.ok}/${c.n}`).join("  "));
console.log("  ...strongest: " + low.slice(-5).reverse().map(([d, c]) => `${d} ${c.ok}/${c.n}`).join("  "));

// what it confuses with what (top guess wrong, among the photos it named)
const pairs = {};
for (const { x, v } of results) if (v.kind === "answered" && v.guesses[0].id !== x.dish) { const k = `${x.dish} -> ${v.guesses[0].id}`; pairs[k] = (pairs[k] ?? 0) + 1; }
const worst = Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log(`\nmost common mix-ups (real dish -> what it said): ` + worst.map(([k, n]) => `${k} x${n}`).join(", "));
