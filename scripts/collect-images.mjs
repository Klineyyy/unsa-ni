// Builds data/images.json, the list of freely licensed photos (Wikimedia Commons) used to build and test the
// dish model, and downloads small copies to .cache/photos (not committed).
//
// Photos are split by PHOTOGRAPHER, not at random: if the same person's photos, often of the same plate in the
// same kitchen, were in both the training and the test set, the test would just measure memory.
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { DISH_SOURCES, OTHER_SOURCES } from "./dish-sources.mjs";

const UA = "unsa-ni/0.1 (https://github.com/Klineyyy/unsa-ni; portfolio project)";
const PER_DISH = Number(process.env.PER_DISH ?? 40);
const PER_ARTIST = 6;
const TEST_TARGET = 8;
const VAL_TARGET = 4;
const MIN_ARTISTS = 5;
const MIN_IMAGES = 16;
const SKIP = /menu|logo|signage|\bsign\b|map of|flag|book|cover|label|packag|\bbox\b|shop|store|stall|restaurant|market|vendor|selling|diagram|drawing|painting|poster|parade|factory|museum|statue/i;
const OK_LICENSE = /^(CC BY|CC BY-SA|CC0|Public domain|PD|Attribution)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(params) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({ format: "json", ...params })) url.searchParams.set(k, v);
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (r.ok) return await r.json();
    } catch {}
    await sleep(700 * (i + 1));
  }
  throw new Error("Commons API failed: " + url);
}

async function members(category, type) {
  const out = [];
  let cont = {};
  do {
    const j = await api({ action: "query", list: "categorymembers", cmtitle: `Category:${category}`, cmtype: type, cmlimit: "500", ...cont });
    out.push(...(j.query?.categorymembers ?? []));
    cont = j.continue ?? null;
  } while (cont);
  return out;
}

const strip = (html) => (html ?? "").replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (arr, rand) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// APPEND=other adds the "not a dish" photos to the existing manifest and leaves every existing photo, and so
// every existing train/val/test assignment (and my review of the test photos), exactly as it was.
const append = process.env.APPEND === "other";
const existing = append ? JSON.parse(await readFile("data/images.json", "utf8")) : [];
const sources = append ? OTHER_SOURCES : DISH_SOURCES;
const claimed = new Set(existing.map((x) => x.pageid));
const manifest = [];
const report = [];
const rand = rng(20260921);

for (const dish of sources) {
  const cats = [];
  for (const c of dish.categories) {
    cats.push(c);
    if (dish.depth !== 0) for (const s of await members(c, "subcat")) cats.push(s.title.replace("Category:", ""));
  }
  const pages = new Map();
  for (const c of cats) for (const f of await members(c, "file")) pages.set(f.pageid, f.title);
  const ids = [...pages.keys()].filter((id) => !claimed.has(id));

  const infos = [];
  for (let i = 0; i < ids.length; i += 40) {
    const j = await api({ action: "query", pageids: ids.slice(i, i + 40).join("|"), prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "448", iiextmetadatafilter: "LicenseShortName|Artist" });
    for (const p of Object.values(j.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0];
      if (!ii || !/^image\/(jpeg|png)$/.test(ii.mime) || ii.width < 400 || ii.height < 300 || SKIP.test(p.title)) continue;
      const license = ii.extmetadata?.LicenseShortName?.value ?? "";
      if (!OK_LICENSE.test(license)) continue;
      infos.push({ pageid: p.pageid, title: p.title, url: ii.thumburl ?? ii.url, page: ii.descriptionurl, license, artist: strip(ii.extmetadata?.Artist?.value).slice(0, 80) || "unknown" });
    }
    await sleep(150);
  }

  // group by photographer, cap each one, then deal whole groups out to test, validation and training
  const groups = new Map();
  for (const x of infos) groups.set(x.artist, [...(groups.get(x.artist) ?? []), x]);
  const chosen = [];
  for (const [artist, list] of shuffle([...groups.entries()], rand)) {
    for (const x of shuffle(list, rand).slice(0, PER_ARTIST)) chosen.push({ ...x, artist });
    if (chosen.length >= PER_DISH * 2) break;
  }
  const byArtist = new Map();
  for (const x of chosen) byArtist.set(x.artist, [...(byArtist.get(x.artist) ?? []), x]);
  // deal each photographer's photos, together, to whichever split is furthest below its target
  const target = { test: TEST_TARGET, val: VAL_TARGET, train: PER_DISH - TEST_TARGET - VAL_TARGET };
  const final = [];
  const counts = { test: 0, val: 0, train: 0 };
  for (const [, list] of shuffle([...byArtist.entries()], rand)) {
    if (final.length >= PER_DISH) break;
    const split = Object.keys(target).sort((a, b) => (target[b] - counts[b]) / target[b] - (target[a] - counts[a]) / target[a])[0];
    for (const x of list) { if (final.length >= PER_DISH) break; final.push({ dish: dish.id, ...x, split }); counts[split]++; }
  }
  const artists = new Set(final.map((x) => x.artist)).size;
  const ok = final.length >= MIN_IMAGES && artists >= MIN_ARTISTS && counts.test >= 3 && counts.train >= 6;
  report.push(`${ok ? "ok  " : "SKIP"} ${dish.id.padEnd(15)} candidates ${String(infos.length).padStart(3)}  chosen ${String(final.length).padStart(2)}  artists ${String(artists).padStart(2)}  train/val/test ${counts.train}/${counts.val}/${counts.test}`);
  if (!ok) continue;
  for (const x of final) claimed.add(x.pageid);
  manifest.push(...final);
}
console.log(report.join("\n"));

// download the small copies
let done = 0;
async function fetchOne(x) {
  const dir = `.cache/photos/${x.dish}`;
  const file = `${dir}/${x.pageid}.jpg`;
  try { await access(file); return; } catch {}
  await mkdir(dir, { recursive: true });
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(x.url, { headers: { "User-Agent": UA } });
      if (r.ok) { await writeFile(file, Buffer.from(await r.arrayBuffer())); return; }
      if (r.status === 429) await sleep(3000 * (i + 1));
    } catch {}
    await sleep(500);
  }
  x.failed = true;
}
const queue = [...manifest];
await Promise.all(Array.from({ length: 4 }, async () => { for (let x; (x = queue.shift()); ) { await fetchOne(x); if (++done % 100 === 0) process.stdout.write(`\r${done}/${manifest.length}`); await sleep(80); } }));
const good = [...existing, ...manifest.filter((x) => !x.failed).map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== "failed")))];
await writeFile("data/images.json", JSON.stringify(good, null, 1) + "\n");
console.log(`\nWrote data/images.json: ${good.length} photos, ${new Set(good.map((x) => x.dish)).size} dishes (${manifest.filter((x) => x.failed).length} downloads failed).`);
