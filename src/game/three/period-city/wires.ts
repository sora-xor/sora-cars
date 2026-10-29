import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { ART_SHORT_SIDE } from '../pixel-art/grid';

/**
 * Overhead wires (電線) as screen-space lines: every cutscene street draws its
 * wires as unbroken lines about one art pixel wide, near and far alike. Wires
 * modelled as thin ribbons fell below an art cell beyond about 30 m and broke
 * up in the cell resolve; these keep WIDTH_CELLS art cells on screen at every
 * distance (fitted to the target being drawn: the pixel-art scene target, or
 * the canvas).
 */
const WIDTH_CELLS = 1.3;
/** Floats per segment: its two ends (chunk-local x, y, z each). */
export const WIRE_STRIDE = 6;

let material: LineMaterial | undefined;
function wireMaterial(): LineMaterial {
  if (material) return material;
  material = new LineMaterial({ color: 0x1c1c22, linewidth: 2, worldUnits: false });
  material.name = 'Period city overhead wires';
  material.fog = true;
  return material;
}

const target = new THREE.Vector2();
/** Fit the line width to the target being drawn (LineSegments2's own fit reads the canvas viewport, not the target). */
function fitWidth(renderer: THREE.WebGLRenderer): void {
  const current = renderer.getRenderTarget();
  if (current) target.set(current.width, current.height); else renderer.getDrawingBufferSize(target);
  const lines = wireMaterial();
  lines.resolution.set(target.x, target.y);
  lines.linewidth = WIDTH_CELLS * Math.min(target.x, target.y) / ART_SHORT_SIDE;
}

/** A chunk's wires (WIRE_STRIDE floats per segment, in the chunk's frame) as one line object; null when it has none. */
export function cityWires(segments: readonly number[]): LineSegments2 | null {
  if (segments.length < WIRE_STRIDE) return null;
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array(segments));
  const lines = new LineSegments2(geometry, wireMaterial());
  lines.name = 'Period city overhead wires';
  lines.onBeforeRender = fitWidth;
  return lines;
}
