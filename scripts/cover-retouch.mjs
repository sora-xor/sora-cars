// Pixel retouching for the v2 soundtrack sleeves. Every operation is local,
// deterministic and recorded in docs/art-prompts/soundtrack-covers-v2.json:
// stray AI lettering and the old corner plaque are removed with a harmonic
// (membrane) fill plus grain copied from neighbouring paper, never a blur smear.
import { execFileSync } from 'node:child_process';

export function readImage(file) {
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file]));
  const { width: w, height: h } = probe.streams[0];
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 30 });
  const data = new Float32Array(w * h * 3);
  for (let i = 0; i < data.length; i++) data[i] = raw[i];
  return { w, h, data };
}

export function writeImage(img, file) {
  const buffer = Buffer.alloc(img.w * img.h * 3);
  for (let i = 0; i < buffer.length; i++) buffer[i] = Math.max(0, Math.min(255, Math.round(img.data[i])));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${img.w}x${img.h}`, '-i', '-', file], { input: buffer, maxBuffer: 1 << 30 });
}

const clone = img => ({ w: img.w, h: img.h, data: new Float32Array(img.data) });
const luma = (img, i) => .2126 * img.data[i * 3] + .7152 * img.data[i * 3 + 1] + .0722 * img.data[i * 3 + 2];

/** Separable Gaussian blur of all three channels. */
export function blur(img, sigma) {
  const radius = Math.ceil(sigma * 3), kernel = [];
  let total = 0;
  for (let k = -radius; k <= radius; k++) { const v = Math.exp(-(k * k) / (2 * sigma * sigma)); kernel.push(v); total += v; }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= total;
  const { w, h } = img, tmp = new Float32Array(img.data.length), out = new Float32Array(img.data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let v = 0;
    for (let k = -radius; k <= radius; k++) v += kernel[k + radius] * img.data[(y * w + Math.min(w - 1, Math.max(0, x + k))) * 3 + c];
    tmp[(y * w + x) * 3 + c] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let v = 0;
    for (let k = -radius; k <= radius; k++) v += kernel[k + radius] * tmp[(Math.min(h - 1, Math.max(0, y + k)) * w + x) * 3 + c];
    out[(y * w + x) * 3 + c] = v;
  }
  return { w, h, data: out };
}

const crop = (img, x0, y0, x1, y1) => {
  const w = x1 - x0, h = y1 - y0, data = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y0 + y) * img.w + x0) * 3, ((y0 + y) * img.w + x1) * 3), y * w * 3);
  return { w, h, data };
};
const paste = (dst, src, x0, y0) => { for (let y = 0; y < src.h; y++) dst.data.set(src.data.subarray(y * src.w * 3, (y + 1) * src.w * 3), ((y0 + y) * dst.w + x0) * 3); };

export function dilate(mask, w, h, radius) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) out[yy * w + xx] = 1;
    }
  }
  return out;
}

/** Find compact glyph components (light-on-dark or dark-on-light) inside a search box. */
export function detectLettering(img, box, { threshold = 26, maxGlyph = 70 } = {}) {
  const { w } = img, x0 = box[0], y0 = box[1], x1 = box[2], y1 = box[3];
  const area = crop(img, x0, y0, x1, y1), background = blur(area, 9), aw = area.w, ah = area.h;
  const hot = new Uint8Array(aw * ah);
  for (let i = 0; i < aw * ah; i++) if (Math.abs(luma(area, i) - luma(background, i)) > threshold) hot[i] = 1;
  // Connected components; keep compact letter-sized shapes on a shared baseline.
  const label = new Int32Array(aw * ah).fill(-1), components = [];
  for (let start = 0; start < aw * ah; start++) {
    if (!hot[start] || label[start] >= 0) continue;
    const stack = [start], pixels = []; label[start] = components.length;
    let minX = aw, minY = ah, maxX = 0, maxY = 0;
    while (stack.length) {
      const p = stack.pop(), px = p % aw, py = (p - px) / aw; pixels.push(p);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = px + dx, ny = py + dy, n = ny * aw + nx;
        if (nx >= 0 && ny >= 0 && nx < aw && ny < ah && hot[n] && label[n] < 0) { label[n] = components.length; stack.push(n); }
      }
    }
    components.push({ pixels, minX, minY, maxX, maxY });
  }
  const glyphs = components.filter(c => c.pixels.length >= 8 && c.maxX - c.minX <= maxGlyph && c.maxY - c.minY <= maxGlyph && c.maxY - c.minY >= 6);
  if (!glyphs.length) return null;
  const centres = glyphs.map(c => (c.minY + c.maxY) / 2).sort((a, b) => a - b), median = centres[Math.floor(centres.length / 2)];
  const line = glyphs.filter(c => Math.abs((c.minY + c.maxY) / 2 - median) < 16);
  const mask = new Uint8Array(img.w * img.h);
  let bx0 = Infinity, by0 = Infinity, bx1 = 0, by1 = 0;
  for (const c of line) {
    for (const p of c.pixels) { const px = p % aw, py = (p - px) / aw; mask[(y0 + py) * w + x0 + px] = 1; }
    bx0 = Math.min(bx0, x0 + c.minX); by0 = Math.min(by0, y0 + c.minY); bx1 = Math.max(bx1, x0 + c.maxX); by1 = Math.max(by1, y0 + c.maxY);
  }
  return { mask, bbox: [bx0, by0, bx1 + 1, by1 + 1], glyphs: line.length };
}

/** Membrane fill: harmonic interpolation of the smoothed surroundings into the hole. */
function harmonic(field, mask, w, h, rect, iterations = 900) {
  const [x0, y0, x1, y1] = rect, inside = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (mask[y * w + x]) inside.push(y * w + x);
  // Row-wise linear start makes the relaxation converge quickly.
  for (let y = y0; y < y1; y++) {
    let x = x0;
    while (x < x1) {
      if (!mask[y * w + x]) { x++; continue; }
      let a = x - 1, b = x;
      while (b < w && mask[y * w + b]) b++;
      for (let c = 0; c < 3; c++) {
        const left = a >= 0 ? field[(y * w + a) * 3 + c] : field[(y * w + b) * 3 + c];
        const right = b < w ? field[(y * w + b) * 3 + c] : left;
        for (let xx = a + 1; xx < b; xx++) field[(y * w + xx) * 3 + c] = left + (right - left) * (xx - a) / (b - a);
      }
      x = b;
    }
  }
  for (let it = 0; it < iterations; it++) for (const p of inside) {
    const x = p % w, y = (p - x) / w;
    for (let c = 0; c < 3; c++) {
      const v = (field[((y) * w + Math.max(0, x - 1)) * 3 + c] + field[((y) * w + Math.min(w - 1, x + 1)) * 3 + c]
        + field[((Math.max(0, y - 1)) * w + x) * 3 + c] + field[((Math.min(h - 1, y + 1)) * w + x) * 3 + c]) / 4;
      field[p * 3 + c] += 1.85 * (v - field[p * 3 + c]);
    }
  }
}

/** Remove a masked region: smooth membrane + matched grain from the cleanest nearby donor. */
export function fillWithGrain(img, mask, { grainSigma = 2.2, margin = 10 } = {}) {
  const { w, h } = img;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { const x = i % w, y = (i - x) / w; x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); }
  if (x0 >= x1) return { donor: null };
  const rx0 = Math.max(0, x0 - margin), ry0 = Math.max(0, y0 - margin), rx1 = Math.min(w, x1 + margin), ry1 = Math.min(h, y1 + margin);
  // Normalized convolution: masked pixels never leak into the smoothed boundary.
  const ox = Math.max(0, rx0 - 12), oy = Math.max(0, ry0 - 12), local = crop(img, ox, oy, Math.min(w, rx1 + 12), Math.min(h, ry1 + 12));
  const weights = { w: local.w, h: local.h, data: new Float32Array(local.data.length) };
  for (let y = 0; y < local.h; y++) for (let x = 0; x < local.w; x++) {
    const keep = mask[(oy + y) * w + ox + x] ? 0 : 1;
    for (let c = 0; c < 3; c++) { weights.data[(y * local.w + x) * 3 + c] = keep; local.data[(y * local.w + x) * 3 + c] *= keep; }
  }
  const smooth = blur(local, grainSigma), support = blur(weights, grainSigma);
  for (let i = 0; i < smooth.data.length; i++) smooth.data[i] = support.data[i] > 1e-3 ? smooth.data[i] / support.data[i] : 0;
  const field = new Float32Array(img.data);
  for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) for (let c = 0; c < 3; c++) field[(y * w + x) * 3 + c] = smooth.data[((y - oy) * smooth.w + (x - ox)) * 3 + c];
  harmonic(field, mask, w, h, [x0, y0, x1, y1]);
  // Grain donor: same-size window nearby with the least structure.
  const bw = x1 - x0, bh = y1 - y0, candidates = [];
  for (const [dx, dy] of [[0, bh + 6], [0, 2 * (bh + 6)], [bw + 6, 0], [-(bw + 6), 0], [0, -(bh + 6)], [bw + 6, bh + 6], [0, 3 * (bh + 6)]]) {
    const sx = x0 + dx, sy = y0 + dy;
    if (sx < 0 || sy < 0 || sx + bw > w || sy + bh > h) continue;
    let overlap = false;
    for (let y = sy; y < sy + bh && !overlap; y++) for (let x = sx; x < sx + bw; x++) if (mask[y * w + x]) { overlap = true; break; }
    if (overlap) continue;
    const window = crop(img, Math.max(0, sx - 8), Math.max(0, sy - 8), Math.min(w, sx + bw + 8), Math.min(h, sy + bh + 8));
    const low = blur(window, grainSigma), lowWide = blur(window, 8);
    let energy = 0, structure = 0, n = 0;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const i = ((y + (sy - Math.max(0, sy - 8))) * window.w + x + (sx - Math.max(0, sx - 8))) * 3;
      for (let c = 0; c < 3; c++) { energy += (window.data[i + c] - low.data[i + c]) ** 2; structure += (low.data[i + c] - lowWide.data[i + c]) ** 2; }
      n++;
    }
    candidates.push({ sx, sy, energy: energy / n, structure: structure / n, window, low });
  }
  candidates.sort((a, b) => a.structure - b.structure);
  const donor = candidates[0];
  // Grain strength around the hole, used to scale the donor residual.
  let ring = 0, ringN = 0;
  for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) {
    if (mask[y * w + x]) continue;
    for (let c = 0; c < 3; c++) ring += (img.data[(y * w + x) * 3 + c] - smooth.data[((y - oy) * smooth.w + (x - ox)) * 3 + c]) ** 2;
    ringN++;
  }
  const ringStd = Math.sqrt(ring / Math.max(1, ringN * 3)), donorStd = donor ? Math.sqrt(donor.energy / 3) : 1;
  const gain = donor && donorStd > 0 ? Math.min(1.6, ringStd / donorStd) : 0;
  // The membrane already meets the untouched surroundings, so masked pixels are replaced outright.
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * w + x, a = mask[i];
    if (!a) continue;
    for (let c = 0; c < 3; c++) {
      let grain = 0;
      if (donor) {
        const dx = x - x0 + (donor.sx - Math.max(0, donor.sx - 8)), dy = y - y0 + (donor.sy - Math.max(0, donor.sy - 8));
        if (dx >= 0 && dy >= 0 && dx < donor.window.w && dy < donor.window.h) {
          const j = (dy * donor.window.w + dx) * 3 + c;
          grain = (donor.window.data[j] - donor.low.data[j]) * gain;
        }
      }
      const filled = field[i * 3 + c] + grain;
      img.data[i * 3 + c] = a * filled + (1 - a) * img.data[i * 3 + c];
    }
  }
  return { donor: donor ? [donor.sx, donor.sy, bw, bh] : null, grainGain: Number(gain.toFixed(3)) };
}

/**
 * Replace a rectangle with the best-matching patch from search windows (optionally mirrored),
 * blended through a feathered ring with a membrane colour correction (seamless clone).
 */
export function patchClone(img, rect, searchWindows, { ring = 14, step = 2, mirror = true, guide = 0 } = {}) {
  const { w, h } = img, [hx0, hy0, hx1, hy1] = rect;
  const ex0 = hx0 - ring, ey0 = hy0 - ring, ex1 = hx1 + ring, ey1 = hy1 + ring, ew = ex1 - ex0, eh = ey1 - ey0;
  const isRing = (x, y) => x < ring || y < ring || x >= ew - ring || y >= eh - ring;
  const ringPixels = [], probes = [];
  for (let y = 0; y < eh; y++) for (let x = 0; x < ew; x++) {
    if (isRing(x, y)) ringPixels.push([x, y]);
    else if (x % 3 === 0 && y % 3 === 0) probes.push([x, y]);
  }
  // Optional guidance: the hole's expected low-frequency colour (membrane fill),
  // compared with a blurred candidate so leaf texture is not penalised.
  let expected = null, soft = null;
  if (guide) {
    const membrane = clone(img), hole = new Uint8Array(w * h);
    for (let y = hy0; y < hy1; y++) for (let x = hx0; x < hx1; x++) hole[y * w + x] = 1;
    fillWithGrain(membrane, hole, { grainSigma: 3 });
    expected = blur(membrane, 10); soft = blur(img, 10);
  }
  const sample = (sx, sy, flip, x, y) => { const xx = flip ? sx + ew - 1 - x : sx + x; return ((sy + y) * w + xx) * 3; };
  let best = null;
  for (const [wx0, wy0, wx1, wy1] of searchWindows) for (const flip of mirror ? [false, true] : [false]) {
    for (let sy = wy0; sy + eh <= wy1; sy += step) for (let sx = wx0; sx + ew <= wx1; sx += step) {
      if (sx < ex1 && sx + ew > ex0 && sy < ey1 && sy + eh > ey0) continue;
      let cost = 0;
      for (let k = 0; k < ringPixels.length; k += 2) {
        const [x, y] = ringPixels[k], a = ((ey0 + y) * w + ex0 + x) * 3, b = sample(sx, sy, flip, x, y);
        cost += (img.data[a] - img.data[b]) ** 2 + (img.data[a + 1] - img.data[b + 1]) ** 2 + (img.data[a + 2] - img.data[b + 2]) ** 2;
        if (best && cost > best.cost) break;
      }
      if (guide && (!best || cost < best.cost)) for (const [x, y] of probes) {
        const a = ((ey0 + y) * w + ex0 + x) * 3, b = sample(sx, sy, flip, x, y);
        cost += guide * ((expected.data[a] - soft.data[b]) ** 2 + (expected.data[a + 1] - soft.data[b + 1]) ** 2 + (expected.data[a + 2] - soft.data[b + 2]) ** 2);
        if (best && cost > best.cost) break;
      }
      if (!best || cost < best.cost) best = { sx, sy, flip, cost };
    }
  }
  // Membrane correction (seamless clone): the smoothed destination/source
  // difference on the outer border is interpolated harmonically inward.
  const pad = 4, smoothDst = blur(crop(img, ex0 - pad, ey0 - pad, ex1 + pad, ey1 + pad), 2);
  const srcX0 = best.sx - pad, srcY0 = best.sy - pad, srcRaw = crop(img, srcX0, srcY0, best.sx + ew + pad, best.sy + eh + pad);
  if (best.flip) for (let y = 0; y < srcRaw.h; y++) for (let x = 0; x < srcRaw.w / 2; x++) for (let c = 0; c < 3; c++) {
    const a = (y * srcRaw.w + x) * 3 + c, b = (y * srcRaw.w + srcRaw.w - 1 - x) * 3 + c, t = srcRaw.data[a];
    srcRaw.data[a] = srcRaw.data[b]; srcRaw.data[b] = t;
  }
  const smoothSrc = blur(srcRaw, 2), diff = new Float32Array(ew * eh * 3), interior = new Uint8Array(ew * eh);
  for (let y = 0; y < eh; y++) for (let x = 0; x < ew; x++) {
    if (x > 0 && y > 0 && x < ew - 1 && y < eh - 1) { interior[y * ew + x] = 1; continue; }
    const k = ((y + pad) * smoothDst.w + x + pad) * 3;
    for (let c = 0; c < 3; c++) diff[(y * ew + x) * 3 + c] = smoothDst.data[k + c] - smoothSrc.data[k + c];
  }
  harmonic(diff, interior, ew, eh, [1, 1, ew - 1, eh - 1], 1600);
  for (let y = 0; y < eh; y++) for (let x = 0; x < ew; x++) {
    const inner = !isRing(x, y), distance = inner ? ring : Math.min(x, y, ew - 1 - x, eh - 1 - y);
    const alpha = inner ? 1 : Math.max(0, Math.min(1, (distance + .5) / ring)) ** 1.5;
    if (!alpha) continue;
    const a = ((ey0 + y) * w + ex0 + x) * 3, b = ((y + pad) * srcRaw.w + x + pad) * 3;
    for (let c = 0; c < 3; c++) img.data[a + c] = alpha * (srcRaw.data[b + c] + diff[(y * ew + x) * 3 + c]) + (1 - alpha) * img.data[a + c];
  }
  return { source: [best.sx, best.sy, ew, eh], mirrored: best.flip, cost: Math.round(best.cost) };
}

/** Fill polygons (even-odd) into a coverage map with ss×ss supersampling. */
export function rasterize(polygons, w, h, ss = 4) {
  const coverage = new Float32Array(w * h), step = 1 / ss;
  let minY = h, maxY = 0;
  for (const poly of polygons) for (const [, y] of poly) { minY = Math.min(minY, Math.floor(y)); maxY = Math.max(maxY, Math.ceil(y)); }
  for (let y = Math.max(0, minY); y <= Math.min(h - 1, maxY); y++) for (let sy = 0; sy < ss; sy++) {
    const yy = y + (sy + .5) * step, xs = [];
    for (const poly of polygons) for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
      if ((y0 <= yy) !== (y1 <= yy)) xs.push(x0 + (yy - y0) / (y1 - y0) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let sx = Math.max(0, Math.floor(xs[k])); sx <= Math.min(w - 1, Math.floor(xs[k + 1])); sx++) {
      let inside = 0;
      for (let s = 0; s < ss; s++) { const xx = sx + (s + .5) * step; if (xx >= xs[k] && xx < xs[k + 1]) inside++; }
      coverage[y * w + sx] += inside / (ss * ss);
    }
  }
  return coverage;
}

/** Darken surface pixels under a soft coverage map by per-channel ratios. */
export function castShadow(img, coverage, ratio, isSurface, strengthAt = () => 1, { soften = 1.4 } = {}) {
  const { w, h } = img, field = { w, h, data: new Float32Array(w * h * 3) };
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) field.data[i * 3 + c] = coverage[i];
  const soft = blur(field, soften);
  let shaded = 0;
  for (let i = 0; i < w * h; i++) {
    const a = soft.data[i * 3] * strengthAt(i);
    if (a < 1e-3 || !isSurface(i)) continue;
    for (let c = 0; c < 3; c++) img.data[i * 3 + c] *= 1 - a * (1 - ratio[c]);
    shaded++;
  }
  return { shaded };
}

/**
 * Replace a masked corridor of smooth painted sky: membrane fill from its edge,
 * plus grain sampled at the first clean offset (so no smear or ring remains).
 */
export function fillCorridor(img, mask, isSurface, offsets, { grainSigma = 2.2 } = {}) {
  const { w, h } = img;
  // Boundary values come only from clean surface pixels (never roofs, hills or the old shadow).
  const smoothSurface = sigma => {
    const weights = { w, h, data: new Float32Array(w * h * 3) }, masked = { w, h, data: new Float32Array(w * h * 3) };
    for (let i = 0; i < w * h; i++) {
      const keep = !mask[i] && isSurface(i) ? 1 : 0;
      for (let c = 0; c < 3; c++) { weights.data[i * 3 + c] = keep; masked.data[i * 3 + c] = img.data[i * 3 + c] * keep; }
    }
    const num = blur(masked, sigma), den = blur(weights, sigma), out = new Float32Array(w * h * 3);
    for (let i = 0; i < out.length; i++) out[i] = den.data[i] > 1e-3 ? num.data[i] / den.data[i] : NaN;
    return out;
  };
  const near = smoothSurface(grainSigma), wide = smoothSurface(14), low = blur(img, grainSigma);
  const field = new Float32Array(img.data);
  for (let i = 0; i < w * h; i++) if (!mask[i]) for (let c = 0; c < 3; c++) {
    const k = i * 3 + c;
    field[k] = isSurface(i) && Number.isFinite(near[k]) ? near[k] : Number.isFinite(wide[k]) ? wide[k] : img.data[k];
  }
  harmonic(field, mask, w, h, [0, 0, w, h], 1500);
  // Grain may only come from open surface at least 4 px from any edge or the hole.
  const open = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) open[i] = !mask[i] && isSurface(i) ? 1 : 0;
  const safe = new Uint8Array(w * h);
  for (let y = 4; y < h - 4; y++) for (let x = 4; x < w - 4; x++) {
    let ok = 1;
    for (let dy = -4; dy <= 4 && ok; dy++) for (let dx = -4; dx <= 4; dx++) if (!open[(y + dy) * w + x + dx]) { ok = 0; break; }
    safe[y * w + x] = ok;
  }
  let sampled = 0, missing = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const x = i % w, y = (i - x) / w;
    let grain = [0, 0, 0];
    for (const [dx, dy] of offsets) {
      const xx = x + dx, yy = y + dy, j = yy * w + xx;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || !safe[j]) continue;
      grain = [0, 1, 2].map(c => img.data[j * 3 + c] - low.data[j * 3 + c]); sampled++; break;
    }
    if (!grain[0] && !grain[1] && !grain[2]) missing++;
    for (let c = 0; c < 3; c++) img.data[i * 3 + c] = field[i * 3 + c] + grain[c];
  }
  return { filled: sampled + missing, grainMissing: missing };
}

export { clone, crop, paste, luma };
