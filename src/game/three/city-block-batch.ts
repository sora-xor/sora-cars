import * as THREE from 'three';
import { CITY_BLOCK_CAPACITIES, type CityBlockBounds, type CityBlockKind, type CityBlockTemplates,
  type CityBlockPlacement, type CityBlockWindow } from './city-blocks';

interface Part { readonly mesh: THREE.InstancedMesh; readonly relative: THREE.Matrix4; readonly triangles: number }
interface Variant { readonly kind: CityBlockKind; readonly variant: number; readonly capacity: number; readonly parts: readonly Part[] }
export interface CityBlockBatchTemplates { readonly buildings: readonly THREE.Group[]; readonly apartments: readonly THREE.Group[] }

/** Full completed architecture, grouped by source mesh into shared instances.
 * Root positions, rotations and scales are intentionally excluded: templates
 * may already occupy the live frontage pool. Every descendant transform,
 * original geometry, material, and custom shadow material remains intact.
 */
export class CityBlockBatch {
  readonly group = new THREE.Group();
  readonly bounds: CityBlockTemplates;
  readonly stats: { readonly meshBatches: number; readonly capacity: number; readonly capacityTriangles: number };
  private readonly variants: Variant[] = [];
  private disposed = false;

  constructor(templates: CityBlockBatchTemplates) {
    if (templates.buildings.length !== 4 || templates.apartments.length !== 2) throw new Error('City batch needs exactly four completed house variants and two apartment variants.');
    this.group.name = 'SORA secondary city blocks';
    const bounds = { buildings: [] as CityBlockBounds[], apartments: [] as CityBlockBounds[] };
    let meshBatches = 0, capacity = 0, capacityTriangles = 0;
    for (const key of ['buildings', 'apartments'] as const) for (const [variant, template] of templates[key].entries()) {
      const count = CITY_BLOCK_CAPACITIES[key][variant]!, kind = key === 'buildings' ? 'building' : 'apartment';
      // Update only derived matrices. No source object transform, visibility,
      // geometry buffer, material or texture is mutated by the batch.
      template.updateWorldMatrix(true, true);
      const inverseRoot = template.matrixWorld.clone().invert(), envelope = new THREE.Box3(), parts: Part[] = [];
      template.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        if (object instanceof THREE.SkinnedMesh || object instanceof THREE.InstancedMesh) {
          throw new Error('City source architecture must contain static completed meshes.');
        }
        // The live pool may hide its template ROOT. Internal authored visibility
        // still matters; do not resurrect deliberately hidden detail children.
        for (let current: THREE.Object3D | null = object; current && current !== template; current = current.parent) {
          if (!current.visible) return;
        }
        const relative = new THREE.Matrix4().multiplyMatrices(inverseRoot, object.matrixWorld);
        const localBounds = object.geometry.boundingBox?.clone()
          ?? new THREE.Box3().setFromBufferAttribute(object.geometry.getAttribute('position') as THREE.BufferAttribute);
        envelope.union(localBounds.applyMatrix4(relative));
        const mesh = new THREE.InstancedMesh(object.geometry, object.material, count);
        mesh.name = `City ${key} ${variant} / ${object.name || parts.length}`;
        mesh.count = 0; mesh.visible = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = object.castShadow; mesh.receiveShadow = object.receiveShadow;
        mesh.customDepthMaterial = object.customDepthMaterial; mesh.customDistanceMaterial = object.customDistanceMaterial;
        mesh.renderOrder = object.renderOrder; mesh.layers.mask = object.layers.mask;
        mesh.onBeforeRender = object.onBeforeRender; mesh.onAfterRender = object.onAfterRender;
        mesh.onBeforeShadow = object.onBeforeShadow; mesh.onAfterShadow = object.onAfterShadow;
        const triangles = (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
        mesh.userData.cityBlockKind = kind; mesh.userData.cityBlockVariant = variant;
        mesh.userData.cityBlockIds = [];
        parts.push({ mesh, relative, triangles }); this.group.add(mesh); meshBatches++; capacityTriangles += triangles * count;
      });
      if (envelope.isEmpty()) throw new Error(`City source ${key} variant ${variant} has no visible mesh geometry.`);
      bounds[key].push({ minX: envelope.min.x, maxX: envelope.max.x, minY: envelope.min.y, maxY: envelope.max.y,
        minZ: envelope.min.z, maxZ: envelope.max.z });
      this.variants.push({ kind, variant, capacity: count, parts }); capacity += count;
    }
    this.bounds = bounds; this.stats = { meshBatches, capacity, capacityTriangles };
    this.group.userData.cityBlockStats = { ...this.stats, visibleBuildings: 0, visibleApartments: 0, visibleTriangles: 0 };
  }

  /** Rebuild only bounded instance matrices when the 20 m scenery cell changes.
   * Sorting stable IDs gives deterministic matrices on reverse travel and laps;
   * source template groups remain owned by the original frontage pool.
   */
  setPlacements(window: CityBlockWindow): void {
    if (this.disposed) throw new Error('Cannot update a disposed city block batch.');
    const root = new THREE.Matrix4(), rotation = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
    const position = new THREE.Vector3(), scale = new THREE.Vector3(1, 1, 1), matrix = new THREE.Matrix4();
    const ids = new Set<string>(); let visibleTriangles = 0;
    const all: readonly CityBlockPlacement[] = [...window.buildings, ...window.apartments];
    for (const placement of all) {
      if (ids.has(placement.id)) throw new Error(`Duplicate city placement: ${placement.id}`);
      ids.add(placement.id);
      if (!placement.position.every(Number.isFinite) || !Number.isFinite(placement.heading)) throw new Error('City placements require finite grounded transforms.');
      if (!this.variants.some(v => v.kind === placement.kind && v.variant === placement.variant)) throw new Error('City placement references an unknown source variant.');
    }
    const selected = this.variants.map(variant => ({ variant,
      placements: all.filter(p => p.kind === variant.kind && p.variant === variant.variant).sort((a, b) => a.id.localeCompare(b.id)) }));
    // Validate the entire new window before changing any live instance state.
    for (const { variant, placements } of selected) if (placements.length > variant.capacity) throw new Error(`City ${variant.kind} ${variant.variant} exceeds its ${variant.capacity}-instance budget.`);
    for (const { variant, placements } of selected) for (const part of variant.parts) {
      part.mesh.count = placements.length; part.mesh.visible = placements.length > 0;
      part.mesh.userData.cityBlockIds = placements.map(p => p.id);
      placements.forEach((placement, index) => {
        position.fromArray(placement.position); rotation.setFromAxisAngle(axis, placement.heading);
        root.compose(position, rotation, scale); matrix.multiplyMatrices(root, part.relative);
        part.mesh.setMatrixAt(index, matrix);
      });
      part.mesh.instanceMatrix.needsUpdate = true;
      // Dynamic instance transforms invalidate Three's cached culling bounds.
      part.mesh.computeBoundingBox(); part.mesh.computeBoundingSphere();
      visibleTriangles += placements.length * part.triangles;
    }
    this.group.userData.cityBlockStats = { ...this.stats, visibleBuildings: window.buildings.length,
      visibleApartments: window.apartments.length, visibleTriangles };
  }

  /** Dispose instance buffers only; source geometry, materials and maps are shared. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const variant of this.variants) for (const part of variant.parts) part.mesh.dispose();
    this.group.clear(); this.variants.length = 0;
  }
}
