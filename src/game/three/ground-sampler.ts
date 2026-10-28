import * as THREE from 'three';

interface GroundTriangle {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  cx: number; cy: number; cz: number;
  denominator: number;
}

/** Index the actual static ground triangles once. Decorative foundations sample
 * this surface rather than a different approximation of nearby road grades.
 * Null means a clipped road opening or a point outside the emitted terrain.
 */
export function createGroundHeightSampler(ground: THREE.Object3D): (x: number, z: number) => number | null {
  const size = 32, cells = new Map<string, GroundTriangle[]>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  ground.updateWorldMatrix(true, true);
  ground.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry, position = geometry.getAttribute('position'), indices = geometry.index;
    if (!position) return;
    const count = indices?.count ?? position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      a.fromBufferAttribute(position, indices ? indices.getX(i) : i).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(position, indices ? indices.getX(i + 1) : i + 1).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(position, indices ? indices.getX(i + 2) : i + 2).applyMatrix4(object.matrixWorld);
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-10) continue;
      const triangle: GroundTriangle = { ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z,
        cx: c.x, cy: c.y, cz: c.z, denominator };
      const minX = Math.floor(Math.min(a.x, b.x, c.x) / size), maxX = Math.floor(Math.max(a.x, b.x, c.x) / size);
      const minZ = Math.floor(Math.min(a.z, b.z, c.z) / size), maxZ = Math.floor(Math.max(a.z, b.z, c.z) / size);
      for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
        const key = `${x}:${z}`, bucket = cells.get(key) ?? [];
        bucket.push(triangle); cells.set(key, bucket);
      }
    }
  });
  return (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    let height: number | null = null;
    for (const triangle of cells.get(`${Math.floor(x / size)}:${Math.floor(z / size)}`) ?? []) {
      const u = ((triangle.bz - triangle.cz) * (x - triangle.cx) + (triangle.cx - triangle.bx) * (z - triangle.cz)) / triangle.denominator;
      const v = ((triangle.cz - triangle.az) * (x - triangle.cx) + (triangle.ax - triangle.cx) * (z - triangle.cz)) / triangle.denominator;
      if (u < -1e-7 || v < -1e-7 || u + v > 1 + 1e-7) continue;
      const y = u * triangle.ay + v * triangle.by + (1 - u - v) * triangle.cy;
      if (height === null || y > height) height = y;
    }
    return height;
  };
}
