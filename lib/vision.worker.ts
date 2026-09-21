/// <reference lib="webworker" />
// Runs CLIP's image model off the main thread: a photo goes in, a 512-number vector describing it comes out.
import { AutoProcessor, CLIPVisionModelWithProjection, env, RawImage } from "@huggingface/transformers";
import { prepareRgb } from "./preprocess";

env.allowLocalModels = false;

const MODEL = "Xenova/clip-vit-base-patch32";

type Processor = (image: RawImage) => Promise<Record<string, unknown>>;
type VisionModel = (inputs: Record<string, unknown>) => Promise<{ image_embeds: { tolist(): number[][] } }>;

let processor: Processor | null = null;
let model: VisionModel | null = null;
let loading: Promise<void> | null = null;
const files = new Map<string, { loaded: number; total: number }>();

function load(): Promise<void> {
  loading ??= (async () => {
    const onProgress = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== "progress" || !p.file || !p.total) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      self.postMessage({ type: "progress", loaded, total });
    };
    processor = (await AutoProcessor.from_pretrained(MODEL)) as unknown as Processor;
    model = (await CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: "q8", progress_callback: onProgress })) as unknown as VisionModel;
  })();
  return loading;
}

self.onmessage = async (event: MessageEvent) => {
  const message = event.data as { type: "init" } | { type: "embed"; id: number; blob: Blob };
  try {
    await load();
    if (message.type === "init") {
      self.postMessage({ type: "ready" });
      return;
    }
    const raw = (await RawImage.fromBlob(message.blob)).rgb();
    const image = new RawImage(prepareRgb(raw.data, raw.width, raw.height, 224), 224, 224, 3);
    const { image_embeds } = await model!(await processor!(image));
    const v = image_embeds.tolist()[0];
    const norm = Math.hypot(...v) || 1;
    self.postMessage({ type: "embedded", id: message.id, vector: v.map((x) => x / norm) });
  } catch (error) {
    if (message.type === "init") loading = null;
    self.postMessage({ type: "error", id: "id" in message ? message.id : undefined, message: String(error) });
  }
};
