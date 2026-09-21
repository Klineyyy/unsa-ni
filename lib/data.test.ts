import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Probe } from "./classify";
import { samples } from "./samples";

// Guards the data the model was built from, and the model file that ships.
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;

interface Photo { dish: string; pageid: number; split: "train" | "val" | "test"; artist: string; license: string; page: string; title: string }
interface Dish { id: string; name: string; kind: string; blurb: string; ingredients: string[]; where: string; visual: string; alsoCalled: string[] }

const dishes = read<Dish[]>("data/dishes.json");
const photos = read<Photo[]>("data/images.json");
const probe = read<Probe>("public/model/probe.json");
const reviewed = read<{ excluded: { pageid: number; dish: string }[] }>("data/reviewed-out.json");

describe("dishes", () => {
  it("has a unique id and name for each, and everything the app shows", () => {
    expect(new Set(dishes.map((d) => d.id)).size).toBe(dishes.length);
    expect(new Set(dishes.map((d) => d.name)).size).toBe(dishes.length);
    for (const d of dishes) {
      expect(d.blurb.length, d.id).toBeGreaterThan(40);
      expect(d.ingredients.length, d.id).toBeGreaterThan(0);
      expect(d.where.length, d.id).toBeGreaterThan(0);
      expect(d.visual.length, d.id).toBeGreaterThan(10);
    }
  });
});

describe("the shipped model file", () => {
  it("lists the dishes in the same order as data/dishes.json, then 'other'", () => {
    expect(probe.classes).toEqual([...dishes.map((d) => d.id), "other"]);
  });

  it("has the right shapes", () => {
    expect(probe.weights).toHaveLength(probe.classes.length);
    for (const row of probe.weights) expect(row).toHaveLength(probe.dim);
    expect(probe.bias).toHaveLength(probe.classes.length);
    expect(probe.dim).toBe(512);
    expect(probe.temperature).toBeGreaterThan(0);
    expect(probe.threshold).toBeGreaterThan(0);
    expect(probe.threshold).toBeLessThan(1);
  });
});

describe("the photos the model learned from and was tested on", () => {
  it("are all freely licensed and credited", () => {
    for (const p of photos) {
      expect(p.license, p.title).toMatch(/^(CC BY|CC BY-SA|CC0|Public domain|PD|Attribution)/i);
      expect(p.artist.length, p.title).toBeGreaterThan(0);
      expect(p.page, p.title).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
    }
  });

  it("never put one photographer's photos of a dish on both sides of a split", () => {
    const byDish = new Map<string, Map<string, Set<string>>>();
    for (const p of photos) {
      const artists = byDish.get(p.dish) ?? new Map<string, Set<string>>();
      artists.set(p.artist, (artists.get(p.artist) ?? new Set()).add(p.split));
      byDish.set(p.dish, artists);
    }
    for (const [dish, artists] of byDish) for (const [artist, splits] of artists) expect(splits.size, `${dish} / ${artist}`).toBe(1);
  });

  it("include enough to train on for every dish that ships", () => {
    for (const d of dishes) expect(photos.filter((p) => p.dish === d.id && p.split === "train").length, d.id).toBeGreaterThanOrEqual(6);
  });

  it("have a reviewed-out list that only names real test photos", () => {
    const test = new Map(photos.filter((p) => p.split === "test").map((p) => [p.pageid, p]));
    for (const x of reviewed.excluded) expect(test.has(x.pageid), `${x.dish} ${x.pageid}`).toBe(true);
    expect(new Set(reviewed.excluded.map((x) => x.pageid)).size).toBe(reviewed.excluded.length);
  });
});

describe("the sample photos in the app", () => {
  it("exist, are credited, and come from the test set so the model never learned from them", () => {
    const byId = new Map(photos.map((p) => [String(p.pageid), p]));
    for (const s of samples) {
      expect(existsSync(`public/samples/${s.file}`), s.file).toBe(true);
      const pageid = /-(\d+)\.jpg$/.exec(s.file)?.[1] ?? "";
      expect(byId.get(pageid)?.split, s.file).toBe("test");
      expect(s.license.length).toBeGreaterThan(0);
    }
  });
});
