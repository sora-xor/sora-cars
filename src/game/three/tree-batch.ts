import * as THREE from 'three';

interface Source { mesh: THREE.Mesh; mask: number }
interface Batch { beauty: THREE.InstancedMesh; shadow: THREE.InstancedMesh; sources: Source[] }

/** Instance repeated source trees without changing their meshes, LODs or leaf cutouts. */
export class TreeBatch {
  readonly group = new THREE.Group();
  private readonly batches: Batch[] = [];
  private readonly sourceBatch = new Map<THREE.Mesh, Batch>();
  private readonly lods: THREE.LOD[] = [];
  private readonly view = new THREE.Frustum();
  private readonly shadowView = new THREE.Frustum();
  private readonly projection = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private enabled = true;

  constructor(private readonly trees: readonly THREE.Group[]) {
    this.group.name = 'Instanced authored trees';
    const bySurface = new Map<string, Source[]>();
    for (const tree of trees) tree.traverse(object => {
      if (object instanceof THREE.LOD) this.lods.push(object);
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      const key = `${object.geometry.uuid}:${object.material.uuid}`;
      const sources = bySurface.get(key) ?? [];
      sources.push({ mesh: object, mask: object.layers.mask }); bySurface.set(key, sources);
      object.layers.mask = 0;
    });
    for (const sources of bySurface.values()) {
      const source = sources[0]!.mesh;
      const create = (shadow: boolean) => {
        const mesh = new THREE.InstancedMesh(source.geometry, source.material, sources.length);
        mesh.name = `${shadow ? 'Shadow' : 'Beauty'} instances: ${source.name}`;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false; // Each source instance is culled before upload.
        mesh.castShadow = shadow; mesh.receiveShadow = !shadow;
        mesh.customDepthMaterial = source.customDepthMaterial;
        mesh.customDistanceMaterial = source.customDistanceMaterial;
        mesh.count = 0;
        if (shadow) {
          // The shadow renderer uses the viewing camera's layers. A zero count
          // in the beauty callback keeps these independent shadow instances out
          // of color rendering without changing GPU buffers between passes.
          let count = 0;
          mesh.onBeforeRender = () => { count = mesh.count; mesh.count = 0; };
          mesh.onAfterRender = () => { mesh.count = count; };
        }
        this.group.add(mesh); return mesh;
      };
      const batch = { beauty: create(false), shadow: create(true), sources };
      this.batches.push(batch);
      for (const { mesh } of sources) this.sourceBatch.set(mesh, batch);
    }
  }

  /** Also used by visual comparison tooling to render the original source trees. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled; this.group.visible = enabled;
    for (const batch of this.batches) for (const source of batch.sources)
      source.mesh.layers.mask = enabled ? 0 : source.mask;
  }

  update(camera: THREE.PerspectiveCamera, light: THREE.DirectionalLight): void {
    if (!this.enabled) return;
    camera.updateMatrixWorld();
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.view.setFromProjectionMatrix(this.projection);
    light.shadow.updateMatrices(light);
    this.shadowView.copy(light.shadow.getFrustum());
    for (const lod of this.lods) lod.update(camera);
    for (const batch of this.batches) batch.beauty.count = batch.shadow.count = 0;
    for (const tree of this.trees) tree.traverseVisible(object => {
      const mesh = object as THREE.Mesh, batch = this.sourceBatch.get(mesh);
      if (!batch) return;
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      this.sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld);
      if (!mesh.frustumCulled || this.view.intersectsSphere(this.sphere))
        batch.beauty.setMatrixAt(batch.beauty.count++, mesh.matrixWorld);
      if (mesh.castShadow && (!mesh.frustumCulled || this.shadowView.intersectsSphere(this.sphere)))
        batch.shadow.setMatrixAt(batch.shadow.count++, mesh.matrixWorld);
    });
    for (const batch of this.batches) for (const mesh of [batch.beauty, batch.shadow]) {
      mesh.visible = mesh.count > 0; mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    this.setEnabled(false);
    // Source geometry and materials belong to the shared scenery asset cache.
    for (const batch of this.batches) { batch.beauty.dispose(); batch.shadow.dispose(); }
    this.group.clear();
  }
}
