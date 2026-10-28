import * as THREE from 'three';

export interface GaragePaintedApron {
  mesh: THREE.Mesh;
  bounds: THREE.Box3;
  diagnostics: {
    sourceTriangles: number;
    paintedTriangles: number;
    remainingTrimTriangles: number;
    paintColor: string;
  };
}

interface Component { triangles: number[]; bounds: THREE.Box3 }

/** Source connectivity joins only coincident position seams. Selection below
 * takes an entire authored shell; no plane cuts or new faces are introduced. */
function components(geometry: THREE.BufferGeometry): Component[] {
  const position = geometry.getAttribute('position'), index = geometry.index;
  if (!position || !index || index.count % 3) throw new Error('Garage apron needs indexed triangles.');
  const parents = Uint32Array.from({ length: position.count }, (_, i) => i);
  const find = (vertex: number): number => {
    while (parents[vertex] !== vertex) {
      parents[vertex] = parents[parents[vertex]!]!;
      vertex = parents[vertex]!;
    }
    return vertex;
  };
  const join = (a: number, b: number) => { parents[find(a)] = find(b); };
  const weld = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)]
      .map(value => Math.round(value * 1e5)).join(',');
    const other = weld.get(key);
    if (other === undefined) weld.set(key, i); else join(i, other);
  }
  for (let i = 0; i < index.count; i += 3) {
    join(index.getX(i), index.getX(i + 1));
    join(index.getX(i), index.getX(i + 2));
  }
  const groups = new Map<number, Component>(), point = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const root = find(index.getX(i));
    let group = groups.get(root);
    if (!group) { group = { triangles: [], bounds: new THREE.Box3() }; groups.set(root, group); }
    group.triangles.push(i / 3);
    for (let corner = 0; corner < 3; corner++) {
      group.bounds.expandByPoint(point.fromBufferAttribute(position, index.getX(i + corner)));
    }
  }
  return [...groups.values()];
}

function copyTriangles(source: THREE.BufferGeometry, triangles: number[]): THREE.BufferGeometry {
  const remap = new Map<number, number>(), vertices: number[] = [], indices: number[] = [];
  for (const triangle of triangles) for (let corner = 0; corner < 3; corner++) {
    const original = source.index!.getX(triangle * 3 + corner);
    let next = remap.get(original);
    if (next === undefined) { next = vertices.length; vertices.push(original); remap.set(original, next); }
    indices.push(next);
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    if (!(attribute instanceof THREE.BufferAttribute)) throw new Error('Garage apron needs noninterleaved car attributes.');
    const ArrayType = attribute.array.constructor as { new(length: number): typeof attribute.array };
    const array = new ArrayType(vertices.length * attribute.itemSize);
    for (let i = 0; i < vertices.length; i++) for (let channel = 0; channel < attribute.itemSize; channel++) {
      array[i * attribute.itemSize + channel] = attribute.array[vertices[i]! * attribute.itemSize + channel]!;
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
  }
  geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(indices), 1));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/**
 * POC-only body-coloured front bumper/apron, separated at its authored seam.
 * Call AFTER prepareEnamelTopology/openGarageHood and BEFORE reflection capture
 * or material styling. Trim UVs are preserved but must not receive the body's
 * unique enamel atlas; only this cloned material's colour/lighting is shared.
 * The grille, mirrors, window seals, rear bumper and side skirts remain Trim1.
 */
export function paintGarageFrontApron(car: THREE.Group): GaragePaintedApron {
  if (car.getObjectByName('Garage painted front apron')) throw new Error('Garage apron is already painted.');
  const surface = (key: string): THREE.Mesh => {
    const matches = car.children.filter((object): object is THREE.Mesh =>
      object instanceof THREE.Mesh && object.userData.shadowKey === key);
    if (matches.length !== 1) throw new Error(`Garage apron cannot identify ${key}.`);
    return matches[0]!;
  };
  const trim = surface('-1:false:false:Trim1'), body = surface('-1:false:false:Primary');
  if (!(body.material instanceof THREE.MeshStandardMaterial)) throw new Error('Garage apron needs the body enamel material.');
  const source = trim.geometry;
  const candidates = components(source).filter(({ bounds: b, triangles }) =>
    triangles.length === 8444 && b.min.x > -.820 && b.min.x < -.816 &&
    b.max.x > .816 && b.max.x < .820 && b.min.y > .211 && b.min.y < .215 &&
    b.max.y > .554 && b.max.y < .558 && b.min.z > 1.413 && b.min.z < 1.418 &&
    b.max.z > 2.087 && b.max.z < 2.093);
  if (candidates.length !== 1) throw new Error('Garage apron no longer matches the audited 8444-triangle AE86 shell.');
  const component = candidates[0]!, selected = new Set(component.triangles), remaining: number[] = [];
  for (let triangle = 0; triangle < source.index!.count / 3; triangle++) {
    if (!selected.has(triangle)) remaining.push(triangle);
  }
  // Prepare owned geometry before mutating the hero. The fleet's source buffer
  // and other car instances keep their original indices and attributes.
  const paintedGeometry = copyTriangles(source, component.triangles);
  const remainingGeometry = copyTriangles(source, remaining);
  const material = body.material.clone();
  material.userData = { ...body.material.userData, garagePaintedApron: true };
  const mesh = new THREE.Mesh(paintedGeometry, material);
  mesh.name = 'Garage painted front apron';
  mesh.castShadow = trim.castShadow; mesh.receiveShadow = trim.receiveShadow;
  mesh.userData.garagePaintedApron = true;
  trim.geometry = remainingGeometry;
  // Existing callbacks close over fleet-wide shadow indices, so these POC
  // partitions use their own complete topology for beauty and shadow draws.
  trim.onBeforeShadow = () => {}; trim.onAfterShadow = () => {};
  delete trim.userData.shadowIndexCount;
  car.add(mesh);
  return { mesh, bounds: component.bounds.clone(), diagnostics: {
    sourceTriangles: source.index!.count / 3,
    paintedTriangles: component.triangles.length,
    remainingTrimTriangles: remaining.length,
    paintColor: material.color.getHexString(),
  } };
}
