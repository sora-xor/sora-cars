/** Shared roadside illustrations. All positions are presentation coordinates. */
const treeSprites = new Map<string, HTMLCanvasElement>();
const shopSprites = new Map<number, HTMLCanvasElement>();
// Initial attract frames may precede the bundled Japanese font. Repaint the
// cached shop signs once the real face is ready, keeping later frames cheap.
if (typeof document !== 'undefined') void document.fonts.ready.then(() => shopSprites.clear());
const wrap = (value: number, length: number) => ((Math.trunc(value) % length) + length) % length;
const SHOPS = ['空本モータース', '純喫茶 あかね', '天空レコード', '空の電器', 'SORA 自転車', '空本写真館'];

function polygon(ctx: CanvasRenderingContext2D, points: readonly number[], fill: string): void {
  ctx.beginPath(); ctx.moveTo(points[0]!, points[1]!);
  for (let index = 2; index < points.length; index += 2) ctx.lineTo(points[index]!, points[index + 1]!);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string): void {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
}

function newSprite(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d')! };
}

/** An irregular silhouette, with small scallops instead of circular leaf blobs. */
function foliage(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, seed: number, color: string): void {
  ctx.beginPath();
  for (let step = 0; step <= 32; step++) {
    const theta = step / 32 * Math.PI * 2;
    const edge = 1 + Math.sin(step * 2.3 + seed) * .085 + Math.cos(step * 4.7 + seed) * .04;
    const px = x + Math.cos(theta) * rx * edge, py = y + Math.sin(theta) * ry * edge;
    if (step === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

function treeSprite(sakura: boolean, variant: number): HTMLCanvasElement {
  const key = `${sakura}:${variant}`, cached = treeSprites.get(key); if (cached) return cached;
  const { canvas, ctx } = newSprite(512, 576);
  ctx.setTransform(5.12, 0, 0, 5.12, 256, 540);
  const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 34);
  shadow.addColorStop(0, '#101b2c80'); shadow.addColorStop(1, '#101b2c00');
  ctx.save(); ctx.scale(1, .16); ctx.fillStyle = shadow; ctx.fillRect(-36, -36, 72, 72); ctx.restore();
  const trunk = ctx.createLinearGradient(-5, 0, 5, 0);
  trunk.addColorStop(0, '#262835'); trunk.addColorStop(.45, '#5b4d50'); trunk.addColorStop(.75, '#847062'); trunk.addColorStop(1, '#3c3842');
  ctx.fillStyle = trunk;
  ctx.beginPath(); ctx.moveTo(-5, 0); ctx.bezierCurveTo(-2, -15, -4, -34, -2, -65);
  ctx.lineTo(2, -68); ctx.bezierCurveTo(1, -38, 2, -14, 6, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#51424a'; ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.lineWidth = 2.7; ctx.beginPath(); ctx.moveTo(0, -31);
    ctx.bezierCurveTo(side * 13, -43, side * 13, -56, side * 23, -64); ctx.stroke();
    ctx.lineWidth = 1.35; ctx.beginPath(); ctx.moveTo(side * 9, -44); ctx.lineTo(side * 30, -52); ctx.stroke();
  }
  const palette = sakura
    ? ['#614854', '#916172', '#b78091', '#d7a2a9', '#ebc4bf', '#f8ddd0']
    : ['#1d353b', '#2b4947', '#3a5c52', '#537261', '#728970', '#9ea788'];
  const crowns = [
    [-22, -58, 17, 18], [21, -57, 18, 18], [-26, -73, 15, 15],
    [23, -76, 17, 16], [-12, -85, 18, 16], [8, -90, 16, 12], [0, -65, 26, 24],
  ];
  crowns.forEach(([x, y, rx, ry], index) => {
    const shift = Math.sin(variant * 3 + index) * 2;
    foliage(ctx, x! + shift, y!, rx!, ry!, variant + index, palette[0]!);
    foliage(ctx, x! - 1 + shift, y! - 3, rx! * .94, ry! * .86, variant + index + 2, palette[1]!);
    foliage(ctx, x! - 3 + shift, y! - 7, rx! * .82, ry! * .61, variant + index + 5, palette[2]!);
    foliage(ctx, x! - 5 + shift, y! - 10, rx! * .59, ry! * .35, variant + index + 8, palette[3]!);
    // Small broken brush marks provide leaf detail without a repeated dot pattern.
    for (let leaf = 0; leaf < 11; leaf++) {
      const phase = leaf * 2.399 + index + variant;
      const lx = x! + shift + Math.cos(phase) * rx! * (.22 + leaf * .052);
      const ly = y! - 5 + Math.sin(phase) * ry! * .65;
      const length = 1.4 + (leaf % 3) * .7;
      polygon(ctx, [lx - length, ly, lx - .4, ly - 1.1, lx + length, ly - .6, lx + .5, ly + .8], palette[leaf % 4 === 0 ? 4 : 3]!);
    }
    if (sakura) {
      for (let blossom = 0; blossom < 6; blossom++) {
        const phase = blossom * 2.83 + index;
        ellipse(ctx, x! - 4 + Math.cos(phase) * rx! * .65, y! - 8 + Math.sin(phase) * ry! * .4, .75, .45, palette[5]!);
      }
    }
  });
  // Narrow exposed branches keep the foliage connected to the ground.
  ctx.strokeStyle = sakura ? '#68545b' : '#536055'; ctx.lineWidth = .65;
  ctx.beginPath(); ctx.moveTo(-1, -30); ctx.quadraticCurveTo(-6, -41, -12, -46);
  ctx.moveTo(2, -32); ctx.quadraticCurveTo(7, -43, 11, -47); ctx.stroke();
  treeSprites.set(key, canvas); return canvas;
}

/** Ground-centred, approximately .85 × size wide and size high. */
export function drawIllustratedTree(
  ctx: CanvasRenderingContext2D, x: number, y: number, size: number,
  sakura: boolean, seed: number, time: number, wind = 0,
): void {
  if (size <= 0) return;
  const sway = Math.sin(time * 1.2 + seed * .71) * Math.min(.012, Math.abs(wind) * .00003);
  ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, sway, 1, 0, 0);
  ctx.drawImage(treeSprite(sakura, wrap(seed, 6)), -size * .5, -size * 540 / 512, size, size * 576 / 512);
  ctx.restore();
}

function shopSprite(variant: number): HTMLCanvasElement {
  const cached = shopSprites.get(variant); if (cached) return cached;
  const { canvas, ctx } = newSprite(704, 576);
  ctx.setTransform(5.12, 0, 0, 5.12, 352, 540);
  const walls = ['#9b9486', '#8c8b91', '#a08b7c', '#778888', '#9a9295', '#919a8f'];
  const fascias = ['#78383e', '#325953', '#394b63', '#914b3f', '#465953', '#76505a'];
  const facade = ctx.createLinearGradient(-52, -95, 38, 0);
  facade.addColorStop(0, '#b1a492'); facade.addColorStop(.35, walls[variant]!); facade.addColorStop(1, '#66656c');
  const pool = ctx.createRadialGradient(0, 0, 3, 0, 0, 60);
  pool.addColorStop(0, '#e1b97d33'); pool.addColorStop(1, '#e1b97d00');
  ctx.save(); ctx.scale(1, .16); ctx.fillStyle = pool; ctx.fillRect(-65, -65, 130, 130); ctx.restore();
  polygon(ctx, [-63, -1, 53, -1, 66, 5, -59, 5], '#555563');
  ctx.fillStyle = '#aca091'; ctx.fillRect(-57, -1.7, 104, 1.8);
  ctx.fillStyle = facade; ctx.fillRect(-54, -96, 94, 95);
  polygon(ctx, [40, -96, 61, -88, 61, -3, 40, -1], '#515965');
  polygon(ctx, [-54, -96, -38, -102, 61, -93, 40, -96], '#7e7e7b');
  polygon(ctx, [-59, -95, 40, -95, 64, -88, 64, -84, 39, -91, -59, -91], '#303b4a');
  ctx.fillStyle = '#b2aaa0'; ctx.fillRect(-58, -96, 98, 1.3);
  ctx.fillStyle = '#474c58'; ctx.fillRect(-49, -100, 4, 8); ctx.fillRect(25, -100, 3, 8);
  ctx.strokeStyle = '#6c7378'; ctx.lineWidth = .6;
  ctx.beginPath(); ctx.moveTo(-47, -100); ctx.lineTo(27, -100); ctx.stroke();
  // Stucco joints and subtle weathering sit behind the window recesses.
  ctx.strokeStyle = '#53556244'; ctx.lineWidth = .45;
  for (const seam of [-84, -62, -41]) { ctx.beginPath(); ctx.moveTo(-53, seam); ctx.lineTo(39, seam); ctx.stroke(); }
  for (let stain = 0; stain < 12; stain++) {
    ctx.fillStyle = stain % 2 ? '#d4c3a812' : '#333e4d13';
    ctx.fillRect(-51 + (stain * 31 + variant * 9) % 86, -90 + (stain * 13) % 46, .8 + stain % 2, 5 + stain % 7);
  }
  for (let floor = 0; floor < 2; floor++) for (let window = 0; window < 3; window++) {
    const wx = -45 + window * 28, wy = -84 + floor * 24;
    const lit = (window + floor + variant) % 4 !== 0;
    ctx.fillStyle = '#464750'; ctx.fillRect(wx - 1.5, wy - 1.2, 20, 18.5);
    const glass = ctx.createLinearGradient(wx, wy, wx + 16, wy + 16);
    glass.addColorStop(0, lit ? '#e6c490' : '#7b8b96'); glass.addColorStop(1, lit ? '#9e8467' : '#34495e');
    ctx.fillStyle = glass; ctx.fillRect(wx, wy, 17, 16);
    ctx.fillStyle = lit ? '#f2d7a166' : '#a1b4c222'; ctx.fillRect(wx + 1, wy + 1, 4, 14);
    ctx.fillStyle = '#655e57'; ctx.fillRect(wx + 7.8, wy, 1, 16);
    ctx.fillStyle = '#dac6a899'; ctx.fillRect(wx + .3, wy, .8, 16);
    ctx.fillStyle = '#bbb09b'; ctx.fillRect(wx - 2, wy + 17, 22, 1.2);
    ctx.fillStyle = '#444c57'; ctx.fillRect(wx - 2, wy + 18.2, 22, .8);
    if (floor === 1) {
      ctx.fillStyle = '#363f4d'; ctx.fillRect(wx - 3, wy + 11, 23, .9);
      for (let rail = 0; rail < 6; rail++) ctx.fillRect(wx - 2 + rail * 4, wy + 11, .5, 7);
    }
  }
  // Upper-floor air conditioner, wiring and a drainpipe give the facade scale.
  ctx.fillStyle = '#b3afa1'; ctx.fillRect(28, -63, 9, 7); ctx.fillStyle = '#5d6264';
  for (let vent = 0; vent < 4; vent++) ctx.fillRect(29, -62 + vent * 1.3, 7, .5);
  ctx.strokeStyle = '#414957'; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.moveTo(-51, -91); ctx.lineTo(-51, -5); ctx.moveTo(39, -89); ctx.lineTo(39, -34); ctx.stroke();
  ctx.strokeStyle = '#c3b598'; ctx.lineWidth = .7;
  ctx.beginPath(); ctx.moveTo(38, -90); ctx.lineTo(38, -35); ctx.stroke();
  ctx.fillStyle = '#283843'; ctx.fillRect(-52, -29, 90, 28);
  const shopGlass = ctx.createLinearGradient(0, -27, 0, 0);
  shopGlass.addColorStop(0, '#d4b486'); shopGlass.addColorStop(.38, '#8b8e85'); shopGlass.addColorStop(1, '#3c5360');
  ctx.fillStyle = shopGlass; ctx.fillRect(-47, -25, 52, 23); ctx.fillRect(11, -25, 21, 24);
  ctx.fillStyle = '#283642'; ctx.fillRect(-23, -25, 1, 23); ctx.fillRect(20.5, -25, 1.2, 24);
  ctx.fillStyle = '#c4b89b'; ctx.fillRect(9, -27, 1.5, 26); ctx.fillRect(32, -27, 1.3, 26);
  polygon(ctx, [-44, -24, -37, -24, -47, -8, -47, -14], '#d6dde233');
  polygon(ctx, [-10, -24, -3, -24, -18, -3, -23, -3], '#d6dde21c');
  ctx.fillStyle = '#c5baa3'; ctx.fillRect(18.2, -13, .8, 5);
  // Books, cups or small bottles behind the glazing, never floating in front.
  for (let item = 0; item < 8; item++) {
    ctx.fillStyle = ['#caad7b', '#8e7264', '#768b86'][item % 3]!;
    ctx.fillRect(-43 + item * 5.5, -9 - item % 3, 3.5, 4 + item % 3);
  }
  ctx.fillStyle = '#50555a'; ctx.fillRect(-47, -5, 52, 1);
  ctx.fillStyle = '#292f3b'; ctx.fillRect(-58, -37, 101, 4);
  ctx.fillStyle = fascias[variant]!; ctx.fillRect(-58, -35, 100, 12);
  ctx.fillStyle = '#d0b894'; ctx.fillRect(-57, -35, 98, .7); ctx.fillRect(-56, -24, 96, .6);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '500 5.7px SoraJP, LabJP, sans-serif';
  ctx.fillStyle = '#f0dfbf'; ctx.fillText(SHOPS[variant]!, -7, -29, 88);
  polygon(ctx, [-57, -23, 41, -23, 46, -18, -61, -18], '#a28c77');
  for (let stripe = 0; stripe < 13; stripe++) {
    const ax = -57 + stripe * 7.5;
    polygon(ctx, [ax, -23, ax + 3.7, -23, ax + 4, -18, ax - .5, -18], fascias[variant]!);
  }
  ctx.fillStyle = '#51484b'; ctx.fillRect(-61, -18, 107, 1.5);
  // Side-wall shade remains cool against the warm shop window.
  polygon(ctx, [45, -77, 55, -74, 55, -57, 45, -60], '#253744');
  polygon(ctx, [46, -76, 54, -73, 54, -59, 46, -61], '#859397');
  ctx.strokeStyle = '#939b97'; ctx.lineWidth = .6;
  ctx.beginPath(); ctx.moveTo(50, -74); ctx.lineTo(50, -60); ctx.stroke();
  // A small period lamp; radial paint supplies glow without a blur filter.
  ctx.strokeStyle = '#333f4d'; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(59, -2); ctx.lineTo(59, -45); ctx.quadraticCurveTo(59, -49, 53, -49); ctx.stroke();
  const glow = ctx.createRadialGradient(52, -47, 0, 52, -47, 11);
  glow.addColorStop(0, '#ffe3ac60'); glow.addColorStop(.3, '#edbd7430'); glow.addColorStop(1, '#edbd7400');
  ctx.fillStyle = glow; ctx.fillRect(41, -58, 22, 22);
  ellipse(ctx, 52, -47, 3, .8, '#f9d696');
  polygon(ctx, [48.5, -48, 50, -50, 54, -50, 55.5, -48], '#3c4852');
  // The flag is composited later so a loading image never poisons this cache.
  ctx.fillStyle = '#414c59'; ctx.fillRect(-60, -65, 6, .9); ctx.fillRect(-62, -65, 1, 16);
  ctx.fillStyle = '#394651'; ctx.fillRect(-66, -63, 12, 11);
  shopSprites.set(variant, canvas); return canvas;
}

/** Ground-centred, approximately 1.3 × size wide and size high. */
export function drawIllustratedShop(
  ctx: CanvasRenderingContext2D, x: number, y: number, size: number,
  seed: number, flag: CanvasImageSource | null,
): void {
  if (size <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100);
  ctx.drawImage(shopSprite(wrap(seed, 6)), -68.75, -105.46875, 137.5, 112.5);
  if (flag) ctx.drawImage(flag, -65, -62, 10, 8.5);
  ctx.restore();
}
