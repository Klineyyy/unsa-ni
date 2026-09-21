import { describe, expect, it } from "vitest";
import { prepareRgb, resizeRgb } from "./preprocess";

const solid = (w: number, h: number, [r, g, b]: number[]) => Uint8ClampedArray.from({ length: w * h * 3 }, (_, i) => [r, g, b][i % 3]);
const px = (data: ArrayLike<number>, w: number, x: number, y: number) => [0, 1, 2].map((c) => data[(y * w + x) * 3 + c]);

describe("resizeRgb", () => {
  it("keeps a flat colour flat, shrinking or enlarging", () => {
    expect(px(resizeRgb(solid(64, 64, [200, 100, 50]), 64, 64, 10, 10), 10, 4, 6)).toEqual([200, 100, 50]);
    expect(px(resizeRgb(solid(4, 4, [10, 20, 30]), 4, 4, 9, 9), 9, 8, 0)).toEqual([10, 20, 30]);
  });

  it("averages the pixels it merges when shrinking (no aliasing)", () => {
    // a 2 x 2 checkerboard of black and white shrinks to one mid-grey pixel
    const board = Uint8ClampedArray.from([0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0]);
    expect(px(resizeRgb(board, 2, 2, 1, 1), 1, 0, 0)).toEqual([128, 128, 128]);
  });

  it("gives the size that was asked for", () => {
    expect(resizeRgb(solid(30, 20, [1, 2, 3]), 30, 20, 7, 5)).toHaveLength(7 * 5 * 3);
  });
});

describe("prepareRgb", () => {
  it("makes a square of the requested size from any shape of photo", () => {
    expect(prepareRgb(solid(400, 100, [9, 9, 9]), 400, 100, 32)).toHaveLength(32 * 32 * 3);
    expect(prepareRgb(solid(50, 300, [9, 9, 9]), 50, 300, 32)).toHaveLength(32 * 32 * 3);
    expect(prepareRgb(solid(10, 10, [9, 9, 9]), 10, 10, 32)).toHaveLength(32 * 32 * 3);
  });

  it("crops the middle of a wide photo", () => {
    // 400 x 100: the left half is red, the right half is blue. Shrunk to a 32 pixel short side it is 128 wide,
    // and the middle 32 pixels straddle the seam
    const w = 400;
    const h = 100;
    const wide = new Uint8ClampedArray(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) wide.set(x < w / 2 ? [255, 0, 0] : [0, 0, 255], (y * w + x) * 3);
    const out = prepareRgb(wide, w, h, 32);
    expect(px(out, 32, 0, 16)).toEqual([255, 0, 0]);
    expect(px(out, 32, 31, 16)).toEqual([0, 0, 255]);
  });

  it("is deterministic", () => {
    const photo = Uint8ClampedArray.from({ length: 90 * 60 * 3 }, (_, i) => (i * 37) % 256);
    expect(Array.from(prepareRgb(photo, 90, 60, 24))).toEqual(Array.from(prepareRgb(photo, 90, 60, 24)));
  });
});
