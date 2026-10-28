import * as THREE from 'three';

interface AttributeRecord { byteOffset: number; count: number; itemSize: number; type: 'float32' | 'uint32' }
interface MeshRecord {
  id: string; baked: boolean; sourceHash: string; vertexCount: number; triangleCount: number;
  attributes: Record<'position' | 'normal' | 'uv' | 'visibility', AttributeRecord>;
  index: AttributeRecord;
}
interface BakeManifest { schemaVersion: number; binarySha256: string; templates: { id: string; meshes: MeshRecord[] }[] }
let pack: Promise<{ manifest: BakeManifest; bytes: ArrayBuffer }> | undefined;
const geometryCache = new Map<string, THREE.BufferGeometry>();
const hashCache = new WeakMap<THREE.BufferGeometry, Promise<string>>();

async function sourceHash(geometry: THREE.BufferGeometry): Promise<string> {
  let pending = hashCache.get(geometry);
  if (!pending) {
    pending = (async () => {
      const attributes = ['position', 'normal', 'uv'].map(name => new Float32Array(geometry.getAttribute(name).array));
      const index = new Uint32Array(geometry.index?.array ?? Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i));
      const arrays = [...attributes, index], bytes = new Uint8Array(arrays.reduce((size, array) => size + array.byteLength, 0));
      let offset = 0;
      for (const array of arrays) { bytes.set(new Uint8Array(array.buffer), offset); offset += array.byteLength; }
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    })();
    hashCache.set(geometry, pending);
  }
  return pending;
}

/** Decode only the authored source-preserving tessellation, never native roads. */
export function decodeArchitectureGeometry(record: MeshRecord, bytes: ArrayBuffer): THREE.BufferGeometry {
  if (!Number.isSafeInteger(record.vertexCount) || record.vertexCount <= 0
    || !Number.isSafeInteger(record.triangleCount) || record.triangleCount <= 0) {
    throw new Error('Invalid architectural visibility geometry count');
  }
  const geometry = new THREE.BufferGeometry();
  const read = (attribute: AttributeRecord, itemSize: number, integer = false) => {
    const elements = attribute.count * attribute.itemSize;
    if (!Number.isSafeInteger(elements) || elements < 0 || attribute.itemSize !== itemSize
      || !Number.isSafeInteger(attribute.byteOffset) || attribute.byteOffset < 0 || attribute.byteOffset % 4
      || attribute.byteOffset + elements * 4 > bytes.byteLength || attribute.type !== (integer ? 'uint32' : 'float32')) {
      throw new Error('Invalid architectural visibility attribute');
    }
    return integer ? new Uint32Array(bytes, attribute.byteOffset, elements) : new Float32Array(bytes, attribute.byteOffset, elements);
  };
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['visibility', 1]] as const) {
    const recordAttribute = record.attributes[name];
    if (recordAttribute.count !== record.vertexCount) throw new Error('Architectural visibility vertex mismatch');
    const values = read(recordAttribute, size);
    if (values.some(value => !Number.isFinite(value) || name === 'visibility' && (value < 0 || value > 1))) throw new Error('Invalid architectural visibility value');
    geometry.setAttribute(name === 'visibility' ? 'architectureVisibility' : name, new THREE.BufferAttribute(values, size));
  }
  const index = read(record.index, 1, true);
  if (index.length !== record.triangleCount * 3 || index.some(value => value >= record.vertexCount)) throw new Error('Invalid architectural visibility index');
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Broad enclosure shading measured from each actual building template.
 * Only indirect light is attenuated; lamps, sunlight and luminous windows
 * retain their standard Three lighting. Geometry and maps are shared by clones.
 */
export class ArchitectureAmbient {
  readonly enabled = { value: 1 };
  readonly stats = { templates: 0, sourceMeshes: 0, triangles: 0 };
  private readonly materials = new WeakMap<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();

  private material(source: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    const previous = this.materials.get(source); if (previous) return previous;
    const material = source.clone(), compile = source.onBeforeCompile, key = source.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      shader.uniforms.architectureAmbientEnabled = this.enabled;
      shader.vertexShader = 'attribute float architectureVisibility; varying float vArchitectureVisibility;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvArchitectureVisibility = architectureVisibility;');
      shader.fragmentShader = 'uniform float architectureAmbientEnabled; varying float vArchitectureVisibility;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', /* glsl */ `
        #include <aomap_fragment>
        // Finite-radius visibility excludes diffuse bounce. Retain a modest
        // ambient floor while keeping exposed surfaces exactly unchanged.
        float enclosureVisibility = mix(1.0, 0.2 + 0.8 * clamp(vArchitectureVisibility, 0.0, 1.0), architectureAmbientEnabled);
        reflectedLight.indirectDiffuse *= enclosureVisibility;
        #if defined(USE_CLEARCOAT)
          clearcoatSpecularIndirect *= enclosureVisibility;
        #endif
        #if defined(USE_SHEEN)
          sheenSpecularIndirect *= enclosureVisibility;
        #endif
        #if defined(USE_ENVMAP) && defined(STANDARD)
          reflectedLight.indirectSpecular *= computeSpecularOcclusion(saturate(dot(geometryNormal, geometryViewDir)), enclosureVisibility, material.roughness);
        #endif
      `);
    };
    material.customProgramCacheKey = () => `${key}:sora-architecture-ambient-v1`;
    this.materials.set(source, material);
    return material;
  }

  async apply(roots: readonly THREE.Group[]): Promise<void> {
    pack ??= (async () => {
      const base = `${import.meta.env.BASE_URL}assets/models/architecture-ambient/`;
      const [json, binary] = await Promise.all([fetch(`${base}manifest.json`), fetch(`${base}geometry.bin`)]);
      if (!json.ok || !binary.ok) throw new Error('Architectural visibility could not load');
      const manifest = await json.json() as BakeManifest;
      if (manifest.schemaVersion !== 1) throw new Error('Unsupported architectural visibility bake');
      const bytes = await binary.arrayBuffer();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      if (digest !== manifest.binarySha256) throw new Error('Architectural visibility data does not match its manifest');
      return { manifest, bytes };
    })();
    const { manifest, bytes } = await pack;
    const changes: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }[] = [];
    const templates = new Set<string>(), geometries = new Set<THREE.BufferGeometry>();
    for (const root of roots) {
      const template = manifest.templates.find(item => item.id === root.name);
      if (!template) throw new Error(`Missing architectural visibility: ${root.name}`);
      templates.add(template.id);
      for (const record of template.meshes) {
        if (!record.baked) continue;
        const mesh = root.children[Number(record.id)];
        if (!(mesh instanceof THREE.Mesh) || !(mesh.material instanceof THREE.MeshStandardMaterial)
          || !mesh.matrix.equals(new THREE.Matrix4()) || await sourceHash(mesh.geometry) !== record.sourceHash) {
          throw new Error(`Architectural visibility source changed: ${template.id}/${record.id}`);
        }
        const cacheKey = `${template.id}/${record.id}/${record.sourceHash}`;
        let geometry = geometryCache.get(cacheKey);
        if (!geometry) { geometry = decodeArchitectureGeometry(record, bytes); geometryCache.set(cacheKey, geometry); }
        geometries.add(geometry);
        changes.push({ mesh, geometry, material: this.material(mesh.material) });
      }
    }
    // A failed or stale bake never leaves half the fleet of building clones changed.
    for (const change of changes) { change.mesh.geometry = change.geometry; change.mesh.material = change.material; }
    this.stats.templates = templates.size; this.stats.sourceMeshes = geometries.size;
    this.stats.triangles = [...geometries].reduce((sum, geometry) => sum + geometry.index!.count / 3, 0);
  }
}
