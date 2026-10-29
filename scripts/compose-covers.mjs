// SORA RECORDS 裏 (URA) edition: a 1980s back-jacket sleeve for every song.
// 表 (OMOTE) is the untouched original cover (-v1.png). 裏 starts from the logo-free
// original generation, removes stray AI lettering, frames a landscape detail of the
// illustration and prints the exact SORA emblem centred on the jacket as a label seal.
//
//   npx tsx scripts/compose-covers.mjs [--only=file,file] [--reuse-clean]
//
// Inputs are pinned by SHA-256; outputs are public/assets/music/covers/<file>-v2.png
// and docs/art-prompts/soundtrack-covers-v2.json (provenance, regions, output hashes).
// With --only, the other sleeves are left as printed and their records kept; the first
// 26 were printed as "No. NN / 26", before the street races' four songs joined the catalog.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { readImage, writeImage, detectLettering, dilate, fillWithGrain, patchClone, rasterize, fillCorridor, castShadow, crop, paste, luma } from './cover-retouch.mjs';
import { MUSIC_SONGS } from '../src/game/music-catalog.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generated = path.join(homedir(), '.codex/generated_images');
const cache = path.join(root, 'output/covers-v2');
const SIZE = 2048, WINDOW = { x: 112, y: 150, w: 1824, h: 1088 }, SEAL = { r: 140, drop: 50 };
const PAPER = '#ECE3CF', INK = '#211D2B', RED = '#D13A37';
const args = process.argv.slice(2);
const only = args.find(a => a.startsWith('--only='))?.slice(7).split(',');
const reuseClean = args.includes('--reuse-clean');

// Exact geometry traced from public/assets/branding/sora-emblem-source.png
// (circle r = 535.5 px about (798.5, 723.5)); units are circle radii, y down.
const EMBLEM = {
  bars: [[-0.61158, -0.49953, 1.22316, 0.16433], [-0.08310, -0.33520, 0.16620, 0.16993], [-0.61158, -0.16527, 1.22316, 0.16527]],
  chevron: [[-0.08310, 0], [-0.95761, 1.3], [-0.76020, 1.3], [0, 0.16993], [0.76020, 1.3], [0.95761, 1.3], [0.08310, 0]],
};

// Source illustration per song (logo-free original generation), in catalog order SR-001 … SR-030.
// Titles, liner notes and collections come from the music catalog at render time.
const SOURCES = {
  'midnight-transistor': { path: '01a0945c-fdc1-7493-8e04-41abe31f7a69/exec-c8ea8bb5-9c3e-46dd-b2d6-a79a2525559c.png', sha256: '61a7701b360084a81fe04331e9cc2325f036689f9dc878d77b1675cb2c3e028b' },
  'harbor-signals': { path: '01a0945c-fdc1-7493-8e04-41abe31f7a69/exec-15360ceb-b326-4678-a524-0de61fa44b9c.png', sha256: 'a71d757abfecdc53978df338a63527339dd1ff5b34c8dcbe2edf3500cde6f8f6' },
  'sakura-express': { path: '01a0945c-fdc1-7493-8e04-41abe31f7a69/exec-5a167d86-74d6-4c86-abfe-6cc1398eaf27.png', sha256: 'd307ad853155659570d111561a3b2207c4f0c4ffb1655e1351d7834ded6baf7c' },
  'soramotos-workshop': { path: '01a0945c-fdc1-7493-8e04-41abe31f7a69/exec-313c61ab-5d94-44e8-bd03-1b7c06861a2f.png', sha256: '73f08ce2fe53d6f8fc667cd91e96660d0aa4750255f8f1fcd4c3c5c9ae5bea8e' },
  'paper-towers': { path: '01a0945c-fdc1-7493-8e04-41abe31f7a69/exec-bb1fab3b-4c1a-422e-bd70-387b56a6a053.png', sha256: '882d0ab2c6485a6d3e42db2a63fecc6e1fae07f5cd10beb81150c49213af46c5' },
  'a-future-we-build': { path: '01a0945c-fdc1-7493-8e04-41abe31f7a69/exec-5b31d00f-ea56-4c13-8d76-8c78c84f1db5.png', sha256: '60c27ad9046e243525211d9d0accfda3973a32b3651c17a9d4ffd694957d3531' },
  'after-the-last-train': { path: '01a0945c-fdc1-7493-8e04-41abe31f7a69/exec-9985ef4b-a8ad-43f4-88d7-ea56d6777b14.png', sha256: '385f58cb0a3564a6bdd3bdf561ba0706b41ff35a82744ed56ca62b888c9d1ad7' },
  'credit-line': { path: '01a0945c-fdc1-7493-8e04-41abe31f7a69/exec-5cdbb305-febd-44ec-8cd0-9d28b39aaeeb.png', sha256: '4fa4bc022347f0472aa5bb36385e5b1408f3bba40e6d757dec96571f15fa099a' },
  'sora-dawn-broadcast': { path: '01a0945c-fdc1-7493-8e04-41abe31f7a69/exec-d92cca34-5e84-4771-9ec2-7591b3a41ff7.png', sha256: '01e81ba2cb5424bfbb8eec81fa863de82b75d148d72c4d6b8f4e1473ab61aad0' },
  'blank-side-promise': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-e3a0163d-ce00-4782-ad14-09d7222d132d.png', sha256: '1686e04d7865f3b081ef498537c8924e446640b406c1a455411d925eed0f3de3' },
  'three-weeks-of-paper': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-0cbb78f8-e954-4b6e-b74d-e1137eb91151.png', sha256: '437ce966931032b4f019387af963e77bdfa4efae929c13e53d9a9cc7c1fd5476' },
  'milk-crates-at-midnight': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-35712dcc-ed3c-45f8-a015-0cf38d9c6bd5.png', sha256: '396a8e440140be744ea6fc00b34f80e26106b71b65612c483aa6abd812403696' },
  'carbon-copy-testimony': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-70caf4da-d598-4ab7-8485-e6e5c7146232.png', sha256: '2fc5ac49de1ecf6c32be0d85010a66ada75f41cc5d242a14b068dc57cc413c18' },
  'crown-on-the-grid': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-185f5dff-9ec6-4ca2-a2d5-e6c570bef501.png', sha256: '4a6a5778b0ed51fa73ccd7427f45a46b338d755ed0fda33f4b86d00150c463fa' },
  'open-circuit-breakfast': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-7ddbdf19-502e-4548-b12d-0d47b4afbe42.png', sha256: '9f21177ae023651923c8bc65d2e5aada0b0d63077cb1e7f4640d56908dab17a1' },
  'one-umbrella-two-chairs': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-d71eca51-2071-43a4-a567-22a0179aa4cb.png', sha256: '6073b07cebe6e1d90b0bd4cbad940ba40c76610998643358fa9462e497f40658' },
  'glass-permission': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-e1df5c2d-728f-4208-bc88-112503d328d6.png', sha256: 'b0e2f99f49755d7bcbda716c790d05264cfe10bad03ea7444b92833126f66039' },
  'two-am-relay': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-e6a97f2a-2e58-4c70-a745-3082c43ac54f.png', sha256: 'd76e049e5c4c69b33d744860c77558220fefd467215d0117743597cdaba4d9e6' },
  'dead-air-confession': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-c7e559e1-c88a-468e-b4af-f28251f6f15c.png', sha256: 'ad919d4fd5a612f1fc1a4eb64763974efeb0b52690d80c113ef302053220b464' },
  'borrowed-power-waltz': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-05d79298-cb24-4039-80bf-92a6a8487e91.png', sha256: '9b66588c3bafefbaddb432a2018c527771316bd01ed4fdeb83864e01ef91b573' },
  'the-frequency-home': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-bf4dcef2-6ddf-4f80-b0eb-5766ce9f9037.png', sha256: '85204e793a8d40775bee55b65fc36f532b035b7d8c4a787ccbbc32851ce89ad7' },
  'no-master-key': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-d2eca1eb-872a-4fd5-82bf-6d8dafd7348f.png', sha256: 'ebb32f6355692ece39ad11b7d28d0a8edac2b3e77875498ec4d2811569d2e45e' },
  'outrun-the-dawn': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-33a6197f-d3e7-49bd-b0bc-7e0c828d8788.png', sha256: '07ce14ca6897c1f38b316962d38608eb5f0c999a820ec8c10b626b61001348cc' },
  'jun-the-first-light': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-4a7d59b1-d53b-4117-8ca0-84a815236e0c.png', sha256: '632daef6b011a08205b63f9d8a6f2536a903082be8c1786083a60da670030b33' },
  'side-b-press-record': { path: '01a0c7fa-b751-7241-941e-4fcfdc603a25/exec-bc043b05-7734-463c-a755-2fec81f6ab70.png', sha256: '01db43c73fdcbe6cf9b4a3715838a305950741fcf7d13a4aada25dbd303d5593' },
  'meet-me-at-yasukuni': { path: '01a0945c-fdc1-7493-8e04-41abe31f7a69/exec-18bbeff4-7044-4b77-ae51-af60e319242c.png', sha256: '82b3c145977e19744fe2c18ef934c4a4b322d54df45dbf6c133afe26ccc9be24' },
  // The street races' songs (SR-027 … SR-030): the logo-free originals, drawn without lettering.
  'forty-eight-turns': { path: '01a187d4-f03f-7780-b567-53b0233f5db0/exec-68a87ff6-05eb-44a9-aac7-5b9971d14df0.png', sha256: 'f368e1ae8def2d7aceec8f0a75c8fed38981b53f220a158ac7e5c706b04c7451' },
  'evening-over-tsuruga': { path: '01a187d4-f00f-7b11-97d1-4645b9696b5c/exec-4e353481-799e-4703-a5ce-93b490ef26b6.png', sha256: '0172c79bcb789e4a2e5ef25d30fbea08a7099268475e2b60b40248e6695b98af' },
  'kamogawa-lights': { path: '01a187d4-efe9-7f53-bca2-c67ae88466c1/exec-d524f229-0ee9-4beb-b12f-110b78d091b5.png', sha256: 'a494e4d0f6146d404ecc9f0c39d0d0025dedf30ce622855ffbc287b1d181aad3' },
  'deer-park-afterglow': { path: '01a187d4-eff9-72a0-a387-3313ba8382b8/exec-6c23db1a-9663-40a2-b981-a3df9ba4f9a3.png', sha256: 'beaa7fdc87028aa10421e107622c7a9cf028d90d4a8558247771e8423f7ee0f6' },
};
// Where each song is set, for the jacket's credit line; Tokyo unless listed.
const PLACES = { 'forty-eight-turns': 'IROHAZAKA', 'evening-over-tsuruga': 'AIZU-WAKAMATSU', 'kamogawa-lights': 'KYOTO', 'deer-park-afterglow': 'NARA' };
const COVERS = MUSIC_SONGS.map(song => {
  if (!SOURCES[song.file]) throw new Error(`No source illustration for ${song.file}`);
  return { file: song.file, ja: song.name.ja, en: song.name.en, collection: song.collection, description: song.description, source: SOURCES[song.file],
    place: PLACES[song.file] ?? 'TOKYO' };
});

// Per-cover framing of the landscape window in source pixels (1254² originals):
// cy/cx = centre of the crop; zoom > 1 narrows the crop for a closer detail.
const FRAMING = {
  'midnight-transistor': { cy: 480 }, 'harbor-signals': { cy: 540 }, 'paper-towers': { cy: 520 }, 'blank-side-promise': { cy: 520 },
  'milk-crates-at-midnight': { cy: 740 }, 'carbon-copy-testimony': { cy: 450 }, 'crown-on-the-grid': { cy: 500 }, 'glass-permission': { cy: 520 },
  'dead-air-confession': { cy: 520 }, 'no-master-key': { cy: 400 }, 'side-b-press-record': { cy: 700 }, 'meet-me-at-yasukuni': { cy: 560 },
  'forty-eight-turns': { cy: 470 }, 'evening-over-tsuruga': { cy: 560 }, 'kamogawa-lights': { cy: 740 }, 'deer-park-afterglow': { cy: 520 },
};
// Per-cover retouching beyond the standard top-left lettering removal.
const RETOUCH = {
  // Drawn without any lettering, so nothing to remove.
  'forty-eight-turns': [], 'evening-over-tsuruga': [], 'kamogawa-lights': [], 'deer-park-afterglow': [],
  'three-weeks-of-paper': [
    { kind: 'lettering' },
    { kind: 'tokyo-tower', note: 'The source casts a sphere-on-needle TV-tower shadow (Berlin Fernsehturm type) that never stood in 1986 Tokyo. Lift it out of the sky and cast a period-correct Tokyo Tower (1958) shadow on the same diagonal.',
      region: [380, 360, 1254, 1040], oldAxis: [[560, 975], [1240, 494]], oldHalfWidth: [74, 18], sphere: [986, 679, 52],
      base: [512, 1012], tip: [1238, 488], squeeze: .72, ratio: [.53, .595, .70], horizon: 976 },
  ],
  'meet-me-at-yasukuni': [
    { kind: 'membrane', rect: [206, 78, 446, 114], note: 'Remove the old "SORA CARS" plaque wordmark over open sky.' },
    { kind: 'clone', rect: [46, 40, 197, 192], windows: [[8, 8, 640, 560], [620, 8, 1246, 560]], ring: 30, guide: 1, note: 'Replace the old white emblem plaque with matched foliage (seamless membrane clone).' },
  ],
};

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function clean(cover) {
  const source = path.join(generated, cover.source.path), out = path.join(cache, 'clean', `${cover.file}.png`);
  if (sha(await readFile(source)) !== cover.source.sha256) throw new Error(`Source changed: ${cover.file}`);
  if (reuseClean && existsSync(out)) return { out, ops: null };
  const img = readImage(source), ops = [], custom = RETOUCH[cover.file];
  for (const op of custom ?? [{ kind: 'lettering' }]) {
    if (op.kind === 'lettering') {
      const found = detectLettering(img, [0, 0, 330, 125]);
      if (!found) throw new Error(`No AI lettering found in ${cover.file}`);
      ops.push({ kind: 'lettering', note: 'Removed the small AI-drawn "SORA" lettering (membrane fill + matched grain).', bbox: found.bbox, glyphs: found.glyphs, ...fillWithGrain(img, dilate(found.mask, img.w, img.h, 4)) });
    } else if (op.kind === 'tokyo-tower') ops.push({ ...op, ...tokyoTower(img, op) });
    else if (op.kind === 'membrane') {
      const mask = new Uint8Array(img.w * img.h);
      for (let y = op.rect[1]; y < op.rect[3]; y++) for (let x = op.rect[0]; x < op.rect[2]; x++) mask[y * img.w + x] = 1;
      ops.push({ ...op, ...fillWithGrain(img, mask) });
    } else if (op.kind === 'clone') ops.push({ ...op, ...patchClone(img, op.rect, op.windows, { ring: op.ring, guide: op.guide }) });
  }
  await mkdir(path.dirname(out), { recursive: true });
  writeImage(img, out);
  return { out, ops };
}

// Tokyo Tower (333 m, 1958) elevation, right half: [height fraction, half-width / height].
const TOKYO_TOWER = [[1, .0015], [.92, .003], [.92, .005], [.86, .005], [.86, .0065], [.79, .0065], [.785, .012], [.77, .012], [.77, .026], [.745, .026], [.745, .016],
  [.6, .024], [.475, .034], [.475, .054], [.468, .058], [.437, .058], [.435, .05], [.43, .041], [.4, .045], [.33, .054], [.26, .066], [.2, .08], [.14, .097], [.09, .115], [.04, .133], [0, .148]];
const TOKYO_TOWER_ARCH = [[0, .108], [.04, .098], [.075, .074], [.1, .04], [.112, 0]];

function tokyoTower(img, op) {
  const [x0, y0, x1, y1] = op.region, area = crop(img, x0, y0, x1, y1), w = area.w, h = area.h;
  const sky = i => { const r = area.data[i * 3], b = area.data[i * 3 + 2]; return b > r + 20 && luma(area, i) > 70 && (i - (i % w)) / w + y0 < op.horizon; };
  // 1. Lift the anachronistic needle-and-sphere shadow out of the sky.
  const [[ax, ay], [bx, by]] = op.oldAxis, len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
  const corridor = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + x0 - ax, py = y + y0 - ay, t = px * ux + py * uy, d = Math.abs(-px * uy + py * ux);
    const half = op.oldHalfWidth[0] + (op.oldHalfWidth[1] - op.oldHalfWidth[0]) * Math.min(1, Math.max(0, t / len)) + 10;
    const inSphere = Math.hypot(x + x0 - op.sphere[0], y + y0 - op.sphere[1]) < op.sphere[2] + 10;
    if (((t > -20 && t < len + 24 && d < half) || inSphere) && sky(y * w + x)) corridor[y * w + x] = 1;
  }
  // Grain comes from clean sky one corridor-width across the shaft, either side.
  const across = (k, sign) => [Math.round(sign * -uy * k), Math.round(sign * ux * k)];
  const lifted = fillCorridor(area, corridor, sky, [across(170, 1), across(170, -1), across(240, 1), across(240, -1), across(320, 1), across(320, -1), [-200, 0], [0, -200], [200, 0], [0, 200], [-150, -150], [150, 150]]);
  // 2. Cast Tokyo Tower along the same light direction, legs hidden behind the roof.
  const [Bx, By] = op.base, [Tx, Ty] = op.tip, L = Math.hypot(Tx - Bx, Ty - By), vx = (Tx - Bx) / L, vy = (Ty - By) / L, nx = -vy, ny = vx;
  const at = (u, v) => [Bx + vx * u * L + nx * v * L * op.squeeze - x0, By + vy * u * L + ny * v * L * op.squeeze - y0];
  const outline = [...TOKYO_TOWER.map(([u, v]) => at(u, v)), ...[...TOKYO_TOWER].reverse().map(([u, v]) => at(u, -v))];
  const arch = [...TOKYO_TOWER_ARCH.map(([u, v]) => at(u, v)), ...[...TOKYO_TOWER_ARCH].reverse().slice(1).map(([u, v]) => at(u, -v))];
  const coverage = rasterize([outline, arch], w, h);
  // Like the source shadow, it fades into the haze toward the roofline; nothing falls below the horizon.
  const fade = i => { const y = (i - (i % w)) / w + y0, x = i % w + x0 - Bx, u = (x * vx + (y - By) * vy) / L; return y >= op.horizon ? 0 : Math.min(1, Math.max(0, (u - .06) / .3)) ** 1.25; };
  const cast = castShadow(area, coverage, op.ratio, sky, fade);
  paste(img, area, x0, y0);
  return { removedPixels: lifted.filled, grainMissing: lifted.grainMissing, shadedPixels: cast.shaded, towerLengthPx: Math.round(L) };
}

function frame(cover, cleanPath) {
  const f = FRAMING[cover.file] ?? {}, zoom = f.zoom ?? 1, aspect = WINDOW.w / WINDOW.h;
  const w = Math.round(1254 / zoom), h = Math.round(w / aspect);
  const x = Math.max(0, Math.min(1254 - w, Math.round((f.cx ?? 627) - w / 2))), y = Math.max(0, Math.min(1254 - h, Math.round((f.cy ?? 627) - h / 2)));
  const out = path.join(cache, 'window', `${cover.file}.png`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', cleanPath, '-vf', `crop=${w}:${h}:${x}:${y},scale=${WINDOW.w}:${WINDOW.h}:flags=lanczos+accurate_rnd,unsharp=5:5:0.35:5:5:0`, '-pix_fmt', 'rgb24', out]);
  return { out, crop: [x, y, w, h], zoom };
}

function emblemSvg(r) {
  const s = v => (v * r).toFixed(3);
  const bars = EMBLEM.bars.map(([x, y, w, h]) => `<rect x="${s(x)}" y="${s(y)}" width="${s(w)}" height="${s(h)}"/>`).join('');
  const chevron = `<polygon points="${EMBLEM.chevron.map(([x, y]) => `${s(x)},${s(y)}`).join(' ')}"/>`;
  return `<svg viewBox="${-r} ${-r} ${2 * r} ${2 * r}" width="${2 * r}" height="${2 * r}"><defs><clipPath id="disc"><circle r="${r}"/></clipPath></defs><circle r="${r}" fill="${RED}"/><g fill="#fff" clip-path="url(#disc)">${bars}${chevron}</g></svg>`;
}

function page(cover, index) {
  const number = String(index + 1).padStart(2, '0'), catalog = `SR-${String(index + 1).padStart(3, '0')}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:SoraJP;src:url(https://covers.local/fonts/noto-sans-jp.ttf) format('truetype');font-weight:100 900}
@font-face{font-family:Sora;src:url(https://covers.local/fonts/sora-regular.woff2) format('woff2');font-weight:400}
@font-face{font-family:Sora;src:url(https://covers.local/fonts/sora-extrabold.woff2) format('woff2');font-weight:800}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${SIZE}px;height:${SIZE}px;overflow:hidden;background:${PAPER}}
.sleeve{position:relative;width:${SIZE}px;height:${SIZE}px;background:${PAPER};color:${INK};font-family:Sora,SoraJP,sans-serif;-webkit-font-smoothing:antialiased}
.grain{position:absolute;inset:0;pointer-events:none}
.head{position:absolute;left:112px;right:112px;top:52px;height:44px;display:flex;align-items:center;justify-content:space-between;font-weight:800;font-size:25px;letter-spacing:.32em}
.head .mid{font-weight:400;font-size:21px;letter-spacing:.3em}
.rule{position:absolute;left:112px;right:112px;height:3px;background:${INK}}
.window{position:absolute;left:${WINDOW.x}px;top:${WINDOW.y}px;width:${WINDOW.w}px;height:${WINDOW.h}px;overflow:hidden;box-shadow:0 0 0 2px ${INK}}
.window img{display:block;width:${WINDOW.w}px;height:${WINDOW.h}px}
.seal{position:absolute;left:${1024 - SEAL.r}px;top:${WINDOW.y + WINDOW.h + SEAL.drop - SEAL.r}px;width:${2 * SEAL.r}px;height:${2 * SEAL.r}px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px ${INK},0 10px 24px #1c18241f;display:grid;place-items:center}
.titles{position:absolute;left:112px;right:112px;top:1462px;text-align:center}
.ja{font-family:SoraJP;font-weight:900;font-size:92px;line-height:1.15;letter-spacing:.06em;white-space:nowrap}
.en{font-weight:800;font-size:38px;letter-spacing:.24em;text-transform:uppercase;margin-top:14px;white-space:nowrap}
.liner{position:absolute;left:180px;right:180px;top:1680px;text-align:center}
.liner p{font-family:SoraJP;font-weight:500;font-size:31px;line-height:1.5;white-space:nowrap}
.liner p+p{font-family:Sora;font-weight:400;font-size:25px;letter-spacing:.02em;margin-top:10px;color:#4b4552}
.foot{position:absolute;left:112px;right:112px;top:1830px;height:112px;border-top:3px solid ${INK};display:grid;grid-template-columns:1fr auto 1fr;align-items:end}
.no{display:flex;align-items:baseline;gap:14px;font-weight:800}
.no small{font-size:22px;letter-spacing:.2em}.no b{font-size:76px;line-height:.9;letter-spacing:-.02em}
.credit{text-align:center;padding-bottom:6px}
.credit b{display:block;font-weight:800;font-size:25px;letter-spacing:.34em}
.credit span{display:block;font-size:18px;letter-spacing:.3em;margin-top:10px}
.edition{display:flex;justify-content:flex-end;align-items:center;gap:22px}
.edition span{text-align:right;font-size:18px;letter-spacing:.24em;line-height:1.6}
.edition span b{display:block;font-weight:800;font-size:24px;letter-spacing:.3em}
.hanko{width:104px;height:104px;background:${RED};color:#FFF7EA;display:grid;place-items:center;font-family:SoraJP;font-weight:900;font-size:76px;line-height:1;transform:rotate(-4deg);border-radius:6px;box-shadow:inset 0 0 0 5px ${RED},inset 0 0 0 8px #FFF7EA}
</style></head><body><div class="sleeve">
<div class="head"><span>SORA RECORDS</span><span class="mid">${esc(cover.collection.toUpperCase())} · 裏ジャケット</span><span>${catalog}</span></div>
<div class="rule" style="top:112px"></div><div class="rule" style="top:121px;height:1px"></div>
<div class="window"><img src="https://covers.local/window/${cover.file}.png" alt=""></div>
<div class="seal">${emblemSvg(112)}</div>
<div class="titles"><div class="ja fit" data-max="1824">${esc(cover.ja)}</div><div class="en fit" data-max="1824">${esc(cover.en)}</div></div>
<div class="liner"><p class="fit" data-max="1688">${esc(cover.description.ja)}</p><p class="fit" data-max="1688">${esc(cover.description.en)}</p></div>
<div class="foot"><div class="no"><small>No.</small><b>${number}</b><small>/ ${COVERS.length}</small></div><div class="credit"><b>SORA CARS</b><span>ORIGINAL SOUNDTRACK · ${esc(cover.place)} 1986</span></div><div class="edition"><span><b>裏 URA</b>BACK SLEEVE</span><div class="hanko">裏</div></div></div>
<svg class="grain" width="${SIZE}" height="${SIZE}"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="${index + 11}"/><feColorMatrix values="0 0 0 0 .13 0 0 0 0 .11 0 0 0 0 .16 0 0 0 .5 0"/></filter><filter id="m"><feTurbulence type="fractalNoise" baseFrequency=".0035" numOctaves="3" seed="${index + 3}"/><feColorMatrix values="0 0 0 0 .45 0 0 0 0 .38 0 0 0 0 .28 0 0 0 .7 -.25"/></filter><rect width="100%" height="100%" filter="url(#m)" opacity=".22"/><rect width="100%" height="100%" filter="url(#g)" opacity=".2"/></svg>
</div><script>
for (const n of document.querySelectorAll('.fit')) { let size = parseFloat(getComputedStyle(n).fontSize); const max = Number(n.dataset.max); while (n.scrollWidth > max && size > 12) { size -= 1; n.style.fontSize = size + 'px'; } }
</script></body></html>`;
}

{
  await mkdir(path.join(cache, 'window'), { recursive: true });
  const fonts = { 'noto-sans-jp.ttf': 'public/assets/fonts/noto-sans-jp.ttf', 'sora-regular.woff2': 'public/assets/sora-regular.woff2', 'sora-extrabold.woff2': 'public/assets/sora-extrabold.woff2' };
  const browser = await chromium.launch({ headless: true });
  const records = [];
  try {
    const tab = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
    await tab.route('https://covers.local/**', route => {
      const [, kind, name] = new URL(route.request().url()).pathname.split('/');
      if (kind === 'fonts' && fonts[name]) return route.fulfill({ path: path.join(root, fonts[name]) });
      if (kind === 'window' && /^[a-z0-9-]+\.png$/.test(name)) return route.fulfill({ path: path.join(cache, 'window', name), contentType: 'image/png' });
      return route.abort();
    });
    for (const [index, cover] of COVERS.entries()) {
      if (only && !only.includes(cover.file)) continue;
      const cleaned = await clean(cover), framed = frame(cover, cleaned.out);
      await tab.setContent(page(cover, index), { waitUntil: 'load' });
      await tab.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode())); });
      const loaded = await tab.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family));
      if (!loaded.includes('SoraJP') || !loaded.includes('Sora')) throw new Error(`Fonts failed to load for ${cover.file}`);
      const out = path.join(root, 'public/assets/music/covers', `${cover.file}-v2.png`);
      await tab.screenshot({ path: out, clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
      const bytes = await readFile(out);
      records.push({ catalog: `SR-${String(index + 1).padStart(3, '0')}`, file: cover.file, sleeve: 'ura',
        printed: { ja: cover.ja, en: cover.en, collection: cover.collection, description: cover.description },
        output: { path: `public/assets/music/covers/${cover.file}-v2.png`, sha256: sha(bytes), bytes: bytes.length, width: SIZE, height: SIZE },
        source: { path: path.join('~/.codex/generated_images', cover.source.path), sha256: cover.source.sha256 },
        retouch: cleaned.ops, window: { crop: framed.crop, zoom: framed.zoom, rect: [WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h] } });
      process.stdout.write(`${cover.file}-v2.png ${sha(bytes).slice(0, 12)}\n`);
    }
  } finally { await browser.close(); }
  // A partial run keeps every other sleeve's record as it was printed.
  const kept = only ? JSON.parse(await readFile(path.join(root, 'docs/art-prompts/soundtrack-covers-v2.json'), 'utf8')) : null;
  if (kept) {
    const byFile = new Map([...kept.covers, ...records].map(record => [record.file, record]));
    kept.covers = COVERS.map(cover => byFile.get(cover.file)).filter(Boolean);
    kept.updatedAt = new Date().toISOString().slice(0, 10);
    await writeFile(path.join(root, 'docs/art-prompts/soundtrack-covers-v2.json'), JSON.stringify(kept, null, 1) + '\n');
  } else {
    const provenance = {
      schemaVersion: 1, createdAt: new Date().toISOString().slice(0, 10), series: 'SORA RECORDS — 裏 (URA) back-jacket edition',
      editions: { omote: '表 OMOTE: the original illustrated cover, public/assets/music/covers/<file>-v1.png, unchanged.', ura: '裏 URA: this back-jacket design, public/assets/music/covers/<file>-v2.png.' },
      method: 'Programmatic composition (npx tsx scripts/compose-covers.mjs, with scripts/cover-retouch.mjs). No new image generation. Logo-free original generations (Yasukuni: the approved corrected v1, plaque retouched out) are cleaned of AI lettering, framed as a landscape detail and set in a printed back-jacket layout.',
      layout: { size: SIZE, window: WINDOW, paper: PAPER, ink: INK, emblem: { red: RED, centre: [1024, WINDOW.y + WINDOW.h + SEAL.drop], radius: 112, label: 'white circular label r=140 centred on the jacket; exact traced geometry, not a font glyph', geometry: EMBLEM, source: 'public/assets/branding/sora-emblem-source.png' }, editionMark: '裏 hanko, bottom right' },
      fonts: { 'Noto Sans JP': 'public/assets/fonts/noto-sans-jp.ttf (SIL OFL, public/assets/fonts/noto-sans-jp-OFL.txt)', Sora: 'public/assets/sora-regular.woff2, public/assets/sora-extrabold.woff2 (SIL OFL)' },
      covers: records,
    };
    await writeFile(path.join(root, 'docs/art-prompts/soundtrack-covers-v2.json'), JSON.stringify(provenance, null, 1) + '\n');
  }
}
