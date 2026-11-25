import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

/**
 * Screen-space levels of detail for a heavy mesh, without new assets.
 *
 * `addDetailLevels` simplifies a geometry's triangles a few times over its own vertices and appends each result to
 * the index buffer, so every level keeps the original positions, normals, UVs and skin weights. `selectDetailByScreen`
 * then draws, each time the mesh is drawn, the coarsest level whose deviation from the full mesh covers at most
 * MAX_PIXEL_ERROR pixels of the image being drawn. Near the camera that is always the full mesh.
 */
export interface DetailLevel {
  /** First index and index count of the level in the geometry's index buffer. */
  readonly start: number;
  readonly count: number;
  /** Largest deviation from the full surface, in the geometry's own units (0 for the full mesh). */
  readonly error: number;
}

/** The share of the full mesh's triangles each simplified level aims for. */
const TARGETS = [0.5, 0.25, 0.12, 0.05] as const;
/** Simplification never deviates further than this share of the mesh's extent. */
const MAX_RELATIVE_ERROR = 0.02;
/** A level must drop at least this share of the triangles of the level before it to be kept. */
const MIN_STEP = 0.2;
/** The largest deviation a drawn level may show, in pixels of the target it is drawn into. */
export const MAX_PIXEL_ERROR = 0.5;
/** Normals take part in the error, so shading keeps its shape where the surface bends. */
const NORMAL_WEIGHT = 0.5;

const levelsOf = new WeakMap<THREE.BufferGeometry, readonly DetailLevel[]>();

/** Let input, downloads and the loading bar run between simplification steps. */
function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/** The geometry's levels, full mesh first, or undefined if it has none. */
export function detailLevels(geometry: THREE.BufferGeometry): readonly DetailLevel[] | undefined {
  return levelsOf.get(geometry);
}

/**
 * Append simplified levels to `geometry`'s index buffer (once; later calls return the same answer). The draw range
 * is set to the full mesh, so a mesh without `selectDetailByScreen` draws exactly what it drew before. False when the
 * geometry cannot be simplified (no index, multi-material groups, packed positions) or WebAssembly is unavailable.
 * `lockBorder` keeps open edges (collars, cuffs, hems) where they are, so separate meshes never open gaps.
 */
export async function addDetailLevels(geometry: THREE.BufferGeometry, options: { lockBorder?: boolean } = {}): Promise<boolean> {
  if (levelsOf.has(geometry)) return true;
  const index = geometry.index, position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  // Material groups would clamp the levels' ranges away (three intersects a group with the draw range).
  if (!index || geometry.groups.length > 0 || !(position instanceof THREE.BufferAttribute) || position.itemSize !== 3
    || !(position.array instanceof Float32Array) || position.normalized) return false;
  await MeshoptSimplifier.ready;
  if (!MeshoptSimplifier.supported || levelsOf.has(geometry)) return levelsOf.has(geometry);
  const start = geometry.drawRange.start, end = Math.min(index.count, start + geometry.drawRange.count);
  const full = Uint32Array.from((index.array as Uint8Array | Uint16Array | Uint32Array).subarray(start, end));
  const positions = position.array, scale = MeshoptSimplifier.getScale(positions, 3);
  const normals = normal instanceof THREE.BufferAttribute && normal.itemSize === 3 && normal.array instanceof Float32Array && !normal.normalized
    ? normal.array : null;
  const flags = options.lockBorder ? ['LockBorder' as const] : [];
  const levels: DetailLevel[] = [{ start: 0, count: full.length, error: 0 }];
  const parts: Uint32Array[] = [full];
  let offset = full.length;
  for (const share of TARGETS) {
    // Each level simplifies the one before (about half the work of starting from the full mesh every time) and
    // carries the sum of the steps' errors, a bound on its distance from the full surface.
    const previous = parts.at(-1)!, target = Math.max(3, Math.floor(full.length / 3 * share) * 3);
    await yieldToMain();
    const [indices, error] = normals
      ? MeshoptSimplifier.simplifyWithAttributes(previous, positions, 3, normals, 3, [NORMAL_WEIGHT, NORMAL_WEIGHT, NORMAL_WEIGHT], null,
        target, MAX_RELATIVE_ERROR, flags)
      : MeshoptSimplifier.simplify(previous, positions, 3, target, MAX_RELATIVE_ERROR, flags);
    // The error bound stops simplification short of the target: once a level no longer pays for itself, stop.
    if (indices.length === 0 || indices.length > previous.length * (1 - MIN_STEP)) break;
    levels.push({ start: offset, count: indices.length, error: levels.at(-1)!.error + error * scale });
    parts.push(indices); offset += indices.length;
  }
  if (levels.length === 1) return false;
  const combined = position.count <= 65536 ? new Uint16Array(offset) : new Uint32Array(offset);
  let at = 0;
  for (const part of parts) { combined.set(part, at); at += part.length; }
  geometry.setIndex(new THREE.BufferAttribute(combined, 1));
  geometry.setDrawRange(0, full.length);
  levelsOf.set(geometry, Object.freeze(levels));
  return true;
}

const bounds = new THREE.Sphere(), eye = new THREE.Vector3(), buffer = new THREE.Vector2();

/**
 * The level to draw for `object` seen by `camera` into an image `height` pixels tall: the coarsest whose deviation
 * stays within MAX_PIXEL_ERROR pixels at the object's nearest point to the camera. Orthographic or unknown cameras
 * draw the full mesh.
 */
export function levelForView(levels: readonly DetailLevel[], object: THREE.Mesh, camera: THREE.Camera, height: number): DetailLevel {
  const full = levels[0]!;
  const perspective = camera as THREE.PerspectiveCamera;
  if (!perspective.isPerspectiveCamera || !(height > 0)) return full;
  const sphere = (object as THREE.SkinnedMesh).boundingSphere ?? object.geometry.boundingSphere;
  if (!sphere) return full;
  bounds.copy(sphere).applyMatrix4(object.matrixWorld);
  eye.setFromMatrixPosition(camera.matrixWorld);
  const distance = Math.max(eye.distanceTo(bounds.center) - bounds.radius, perspective.near);
  const pixelsPerUnit = height * perspective.zoom / (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2) * distance)
    * object.matrixWorld.getMaxScaleOnAxis();
  let chosen = full;
  for (const level of levels) if (level.error * pixelsPerUnit <= MAX_PIXEL_ERROR) chosen = level;
  return chosen;
}

/** Draw `mesh` at the level its size on screen allows, chosen for each draw (each camera and render target). */
export function selectDetailByScreen(mesh: THREE.Mesh): void {
  const before = mesh.onBeforeRender, after = mesh.onAfterRender;
  mesh.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
    before.call(this, renderer, scene, camera, geometry, material, group);
    const levels = levelsOf.get(geometry);
    if (!levels) return;
    const target = renderer.getRenderTarget();
    const level = levelForView(levels, mesh, camera, target ? target.height : renderer.getDrawingBufferSize(buffer).y);
    geometry.drawRange.start = level.start; geometry.drawRange.count = level.count;
  };
  mesh.onAfterRender = function (renderer, scene, camera, geometry, material, group) {
    // Other users of the shared geometry (shader preparation, bounds, picking) keep seeing the full mesh.
    const full = levelsOf.get(geometry)?.[0];
    if (full) { geometry.drawRange.start = full.start; geometry.drawRange.count = full.count; }
    after.call(this, renderer, scene, camera, geometry, material, group);
  };
}
