import * as THREE from 'three';

/** The emblem's circle inside branding/sora-emblem-source.png (an opaque white square around it). */
export const EMBLEM_CIRCLE = { x: 263, y: 188, size: 1071 } as const;

/**
 * The exact SORA emblem as a roundel: the source circle, clipped, inside a
 * thin white ring, transparent outside. It fills in once the image loads.
 */
export function soraEmblemTexture(url: string, size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; texture.name = 'SORA emblem roundel';
  const image = new Image();
  image.onload = () => {
    const context = canvas.getContext('2d')!, r = size / 2, inner = r * .9;
    context.fillStyle = '#ffffff'; context.beginPath(); context.arc(r, r, r, 0, Math.PI * 2); context.fill();
    context.save(); context.beginPath(); context.arc(r, r, inner, 0, Math.PI * 2); context.clip();
    context.drawImage(image, EMBLEM_CIRCLE.x, EMBLEM_CIRCLE.y, EMBLEM_CIRCLE.size, EMBLEM_CIRCLE.size, r - inner, r - inner, inner * 2, inner * 2);
    context.restore();
    texture.needsUpdate = true;
  };
  image.src = url;
  return texture;
}

/**
 * A club strip for a car's rear window (1024 x `height`, 160 by default) or
 * an airship's side: the exact emblem in the centre on a white roundel, a
 * word either side, as on the street banners.
 */
export function soraStripTexture(url: string, left = 'SORA', right = 'MOTOR CLUB', height = 160): THREE.CanvasTexture {
  const width = 1024, canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; texture.name = `SORA strip (${left} ${right})`;
  const k = height / 160;
  const paint = (image: HTMLImageElement | null) => {
    const context = canvas.getContext('2d')!, cx = width / 2, cy = height / 2;
    context.fillStyle = '#f4f1e8'; context.fillRect(0, 0, width, height);
    context.fillStyle = '#c8312b'; context.fillRect(0, 8 * k, width, 8 * k); context.fillRect(0, height - 16 * k, width, 8 * k);
    context.fillStyle = '#ffffff'; context.beginPath(); context.arc(cx, cy, 66 * k, 0, Math.PI * 2); context.fill();
    if (image) {
      const r = 58 * k;
      context.save(); context.beginPath(); context.arc(cx, cy, r, 0, Math.PI * 2); context.clip();
      context.drawImage(image, EMBLEM_CIRCLE.x, EMBLEM_CIRCLE.y, EMBLEM_CIRCLE.size, EMBLEM_CIRCLE.size, cx - r, cy - r, r * 2, r * 2);
      context.restore();
    }
    context.fillStyle = '#b3261f'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = `900 ${Math.round(84 * k)}px "Hiragino Kaku Gothic ProN", SoraJP, "Noto Sans JP", sans-serif`;
    context.fillText(left, cx / 2 - 30 * k, cy + 4 * k, cx - 150 * k); context.fillText(right, cx + cx / 2 + 30 * k, cy + 4 * k, cx - 150 * k);
    texture.needsUpdate = true;
  };
  paint(null);
  const image = new Image();
  image.onload = () => paint(image);
  image.src = url;
  return texture;
}
