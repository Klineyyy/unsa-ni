// Gets a photo ready for CLIP: shrink so the short side is `size` pixels, then cut the middle `size` x `size`.
//
// This is done by hand, rather than left to the browser or to the image library, on purpose. A browser's canvas
// and Node's image library shrink a photo in slightly different ways, and the model's answer on a photo near the
// line between two dishes can flip because of it. The model is trained on vectors made by this code and the app
// uses this same code, so the two always see the same pixels.

interface Tap {
  index: number[];
  weight: number[];
}

/** For each output pixel along one axis, which input pixels feed it and by how much. */
function taps(sourceLength: number, targetLength: number): Tap[] {
  const scale = sourceLength / targetLength;
  const out: Tap[] = [];
  for (let i = 0; i < targetLength; i++) {
    const index: number[] = [];
    const weight: number[] = [];
    if (scale > 1) {
      // shrinking: average everything that falls inside this output pixel (a box filter, so no aliasing)
      const a = i * scale;
      const b = (i + 1) * scale;
      for (let k = Math.floor(a); k < Math.min(sourceLength, Math.ceil(b)); k++) {
        index.push(k);
        weight.push(Math.min(b, k + 1) - Math.max(a, k));
      }
    } else {
      // enlarging: blend the two nearest pixels
      const c = (i + 0.5) * scale - 0.5;
      const k = Math.floor(c);
      const f = c - k;
      index.push(Math.max(0, Math.min(sourceLength - 1, k)), Math.max(0, Math.min(sourceLength - 1, k + 1)));
      weight.push(1 - f, f);
    }
    const sum = weight.reduce((s, w) => s + w, 0);
    out.push({ index, weight: weight.map((w) => w / sum) });
  }
  return out;
}

/** Resize 3-channel (RGB) pixels. */
export function resizeRgb(source: ArrayLike<number>, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const across = taps(sw, dw);
  const down = taps(sh, dh);

  const wide = new Float32Array(dw * sh * 3);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < dw; x++) {
      const { index, weight } = across[x];
      let r = 0;
      let g = 0;
      let b = 0;
      for (let t = 0; t < index.length; t++) {
        const at = (y * sw + index[t]) * 3;
        r += source[at] * weight[t];
        g += source[at + 1] * weight[t];
        b += source[at + 2] * weight[t];
      }
      const to = (y * dw + x) * 3;
      wide[to] = r;
      wide[to + 1] = g;
      wide[to + 2] = b;
    }
  }

  const out = new Uint8ClampedArray(dw * dh * 3);
  for (let y = 0; y < dh; y++) {
    const { index, weight } = down[y];
    for (let x = 0; x < dw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let t = 0; t < index.length; t++) {
        const at = (index[t] * dw + x) * 3;
        r += wide[at] * weight[t];
        g += wide[at + 1] * weight[t];
        b += wide[at + 2] * weight[t];
      }
      const to = (y * dw + x) * 3;
      out[to] = r; // Uint8ClampedArray rounds and clamps
      out[to + 1] = g;
      out[to + 2] = b;
    }
  }
  return out;
}

/** RGB pixels in, `size` x `size` RGB pixels out. */
export function prepareRgb(source: ArrayLike<number>, width: number, height: number, size = 224): Uint8ClampedArray {
  const scale = size / Math.min(width, height);
  const nw = Math.max(size, Math.round(width * scale));
  const nh = Math.max(size, Math.round(height * scale));
  const resized = resizeRgb(source, width, height, nw, nh);

  const left = Math.floor((nw - size) / 2);
  const top = Math.floor((nh - size) / 2);
  const out = new Uint8ClampedArray(size * size * 3);
  for (let y = 0; y < size; y++) {
    const from = ((y + top) * nw + left) * 3;
    out.set(resized.subarray(from, from + size * 3), y * size * 3);
  }
  return out;
}
