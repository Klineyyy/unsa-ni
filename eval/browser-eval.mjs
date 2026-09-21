// The same test photos, but pushed through the real app in a real browser (its Web Worker, its canvas, its JPEG
// decoder) instead of through Node. This is what a visitor actually gets.
//
//   npm i --no-save playwright && npx playwright install chromium
//   npm run build && npx next start -p 3200      # in another terminal
//   node eval/browser-eval.mjs
//
// It also reports how many photos got the same answer as in Node (eval/dish-accuracy.mjs).
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { classify } from "../lib/classify.ts";

const ROOT = process.cwd();
const BASE = process.env.BASE ?? "http://localhost:3200";
const cache = JSON.parse(await readFile(`${ROOT}/.cache/clip-clip-vit-base-patch32.json`, "utf8"));
const probe = JSON.parse(await readFile(`${ROOT}/public/model/probe.json`, "utf8"));
const dishes = JSON.parse(await readFile(`${ROOT}/data/dishes.json`, "utf8"));
const nameToId = new Map(dishes.map((d) => [d.name, d.id]));
const dropped = new Set(cache.reviewedOut);
const test = JSON.parse(await readFile(`${ROOT}/data/images.json`, "utf8")).filter((x) => x.split === "test" && cache.images[x.pageid] && !dropped.has(x.pageid));
const LIMIT = Number(process.env.LIMIT ?? test.length);

const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(BASE, { waitUntil: "networkidle" });
const input = page.locator('input[type=file]:not([capture])');

async function run(file) {
  const prev = await page.locator('section[aria-label="Result"] img').first().getAttribute("src").catch(() => null);
  await input.setInputFiles(file);
  await page.waitForFunction((prev) => {
    const im = document.querySelector('section[aria-label="Result"] img');
    return im && im.getAttribute("src") !== prev && !document.body.innerText.includes("Looking");
  }, prev, { timeout: 600000 });
  const text = await page.locator('section[aria-label="Result"]').innerText();
  if (/doesn.t look like a Filipino dish/.test(text)) return { kind: "rejected" };
  if (/I.m not sure/.test(text)) {
    const first = await page.locator('section[aria-label="Result"] ol li button span.font-semibold').first().innerText();
    return { kind: "unsure", top: nameToId.get(first) };
  }
  const name = await page.locator('section[aria-label="Result"] p.font-display').first().innerText();
  return { kind: "answered", top: nameToId.get(name) };
}

let agree = 0, n = 0;
const rows = [];
for (const x of test.slice(0, LIMIT)) {
  const got = await run(`${ROOT}/.cache/photos/${x.dish}/${x.pageid}.jpg`);
  const node = classify(cache.images[x.pageid], probe);
  const same = got.kind === node.kind && (got.kind === "rejected" || got.top === node.guesses[0].id);
  if (same) agree++;
  rows.push({ x, got, node, other: x.dish.startsWith("other-") });
  if (++n % 25 === 0) console.log(`${n}/${Math.min(LIMIT, test.length)}  agrees with Node so far: ${agree}/${n}`);
}
const pc = (a, d) => `${((100 * a) / d).toFixed(0)}%`;
const dish = rows.filter((r) => !r.other), oth = rows.filter((r) => r.other);
const ans = dish.filter((r) => r.got.kind === "answered");
console.log(`\nIN THE BROWSER (n=${rows.length}); same answer as the Node run on ${agree}/${n} photos (${pc(agree, n)})`);
console.log(`dish photos (n=${dish.length}): names the dish ${pc(ans.length, dish.length)} (right ${pc(ans.filter((r) => r.got.top === r.x.dish).length, ans.length)} of those) | not sure ${pc(dish.filter((r) => r.got.kind === "unsure").length, dish.length)} | not a dish ${pc(dish.filter((r) => r.got.kind === "rejected").length, dish.length)}`);
console.log(`other photos (n=${oth.length}): not a dish ${pc(oth.filter((r) => r.got.kind === "rejected").length, oth.length)} | not sure ${pc(oth.filter((r) => r.got.kind === "unsure").length, oth.length)} | named as a dish ${pc(oth.filter((r) => r.got.kind === "answered").length, oth.length)}`);
console.log("page errors:", errors.length ? errors : "none");
await b.close();
