// Turns every photo and every dish description into a CLIP vector, and caches them in .cache/ so that
// training and evaluation can be repeated in seconds.
//
//   MODEL=Xenova/clip-vit-base-patch32 node scripts/embed-photos.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { AutoProcessor, AutoTokenizer, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";
import { prepareRgb } from "../lib/preprocess.ts";
import { OTHER_PROMPTS, promptsFor } from "../lib/prompts.ts";

const MODEL = process.env.MODEL ?? "Xenova/clip-vit-base-patch32";
const slug = MODEL.split("/")[1];

const dishes = JSON.parse(await readFile("data/dishes.json", "utf8"));
const known = new Set(dishes.map((d) => d.id));
const images = JSON.parse(await readFile("data/images.json", "utf8")).filter((x) => known.has(x.dish) || x.dish.startsWith("other-"));
const out = new Set(JSON.parse(await readFile("data/reviewed-out.json", "utf8")).excluded.map((x) => x.pageid));

const processor = await AutoProcessor.from_pretrained(MODEL);
const vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: "q8" });
const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const text = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: "q8" });

const unit = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };

// photos already embedded by an earlier run are reused, so adding photos only costs the new ones
const cachePath = `.cache/clip-${slug}.json`;
let vectors = {};
try { vectors = JSON.parse(await readFile(cachePath, "utf8")).images ?? {}; } catch {}
const todo = images.filter((x) => !vectors[x.pageid]);
console.log(`${todo.length} new photos to embed (${images.length - todo.length} cached)`);
for (let i = 0; i < todo.length; i += 16) {
  const batch = todo.slice(i, i + 16);
  // the same preparation code the browser runs (lib/preprocess.ts), so training and the app see the same pixels
  const raw = await Promise.all(batch.map(async (x) => {
    const img = (await RawImage.read(`.cache/photos/${x.dish}/${x.pageid}.jpg`)).rgb();
    return new RawImage(prepareRgb(img.data, img.width, img.height, 224), 224, 224, 3);
  }));
  const { image_embeds } = await vision(await processor(raw));
  image_embeds.tolist().forEach((v, k) => (vectors[batch[k].pageid] = unit(v).map((x) => Math.round(x * 1e5) / 1e5)));
  process.stdout.write(`\r${Math.min(i + 16, todo.length)}/${todo.length} photos`);
}
process.stdout.write("\n");

const prompts = {};
for (const d of dishes) {
  const list = promptsFor(d);
  const { text_embeds } = await text(tokenizer(list, { padding: true, truncation: true }));
  prompts[d.id] = text_embeds.tolist().map((v) => unit(v).map((x) => Math.round(x * 1e5) / 1e5));
}

{
  const { text_embeds } = await text(tokenizer(OTHER_PROMPTS, { padding: true, truncation: true }));
  prompts.other = text_embeds.tolist().map((v) => unit(v).map((x) => Math.round(x * 1e5) / 1e5));
}

await mkdir(".cache", { recursive: true });
await writeFile(`.cache/clip-${slug}.json`, JSON.stringify({ model: MODEL, images: vectors, prompts, reviewedOut: [...out] }));
console.log(`Wrote .cache/clip-${slug}.json (${Object.keys(vectors).length} photos, ${dishes.length} dishes)`);
