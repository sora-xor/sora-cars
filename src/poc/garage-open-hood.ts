import * as THREE from 'three';

interface Component {
  root: number;
  triangles: number[];
  bounds: THREE.Box3;
}

export interface GarageOpenHood {
  /** Unrotated container in the car's normalized local coordinates. */
  group: THREE.Group;
  /** Authored bonnet and washers, with the rear hinge as their origin. */
  pivot: THREE.Group;
  hinge: THREE.Vector3;
  /** Bounds of the authored bonnet while closed, in car coordinates. */
  bounds: THREE.Box3;
  diagnostics: {
    hoodTriangles: number;
    washerTriangles: number;
    primarySourceTriangles: number;
    primaryRemainingTriangles: number;
    trimSourceTriangles: number;
    trimRemainingTriangles: number;
  };
}

/** Connectivity follows authored triangles. Position welding joins UV/normal
 * seams only; it never selects or cuts individual faces by a spatial plane. */
function components(geometry: THREE.BufferGeometry): Component[] {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  if (!index || index.count % 3) throw new Error('Garage bonnet needs indexed triangles.');
  const roots = Uint32Array.from({ length: position.count }, (_, i) => i);
  const find = (vertex: number): number => {
    while (roots[vertex] !== vertex) {
      roots[vertex] = roots[roots[vertex]!]!;
      vertex = roots[vertex]!;
    }
    return vertex;
  };
  const join = (a: number, b: number) => { roots[find(a)] = find(b); };
  const welded = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)]
      .map(value => Math.round(value * 1e5)).join(',');
    const other = welded.get(key);
    if (other === undefined) welded.set(key, i);
    else join(i, other);
  }
  for (let i = 0; i < index.count; i += 3) {
    join(index.getX(i), index.getX(i + 1));
    join(index.getX(i), index.getX(i + 2));
  }
  const result = new Map<number, Component>();
  const point = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const root = find(index.getX(i));
    let component = result.get(root);
    if (!component) {
      component = { root, triangles: [], bounds: new THREE.Box3() };
      result.set(root, component);
    }
    component.triangles.push(i / 3);
    for (let corner = 0; corner < 3; corner++) {
      component.bounds.expandByPoint(point.fromBufferAttribute(position, index.getX(i + corner)));
    }
  }
  return [...result.values()];
}

/** Compact copies preserve authored UVs and normals without modifying the
 * fleet's shared geometry or leaving unused vertices in the culling bounds. */
function copyTriangles(source: THREE.BufferGeometry, triangles: number[]): THREE.BufferGeometry {
  const index = source.index!;
  const vertices: number[] = [], remap = new Map<number, number>(), indices: number[] = [];
  for (const triangle of triangles) {
    for (let corner = 0; corner < 3; corner++) {
      const original = index.getX(triangle * 3 + corner);
      let next = remap.get(original);
      if (next === undefined) {
        next = vertices.length;
        vertices.push(original);
        remap.set(original, next);
      }
      indices.push(next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, sourceAttribute] of Object.entries(source.attributes)) {
    if (!(sourceAttribute instanceof THREE.BufferAttribute)) {
      throw new Error('Garage bonnet expects the normalized noninterleaved car attributes.');
    }
    const ArrayType = sourceAttribute.array.constructor as {
      new(length: number): typeof sourceAttribute.array;
    };
    const array = new ArrayType(vertices.length * sourceAttribute.itemSize);
    for (let i = 0; i < vertices.length; i++) {
      for (let channel = 0; channel < sourceAttribute.itemSize; channel++) {
        array[i * sourceAttribute.itemSize + channel] =
          sourceAttribute.array[vertices[i]! * sourceAttribute.itemSize + channel]!;
      }
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(array, sourceAttribute.itemSize, sourceAttribute.normalized));
  }
  geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(indices), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function planSplit(mesh: THREE.Mesh, selected: Component[]) {
  const source = mesh.geometry;
  const selectedTriangles = new Set(selected.flatMap(component => component.triangles));
  const moving: number[] = [], remaining: number[] = [];
  for (let triangle = 0; triangle < source.index!.count / 3; triangle++) {
    (selectedTriangles.has(triangle) ? moving : remaining).push(triangle);
  }
  if (!moving.length || !remaining.length) throw new Error('Garage bonnet split must retain both surfaces.');
  return {
    sourceCount: source.index!.count / 3,
    moving: copyTriangles(source, moving),
    remaining: copyTriangles(source, remaining),
  };
}

/** POC-only articulation of complete disconnected parts in the licensed AE86.
 * Production loading, the source GLB and every other fleet instance stay intact.
 * Call before the proof's shader, reflection and glazing setup. */
export function openGarageHood(car: THREE.Group, angleDegrees = 64): GarageOpenHood {
  if (car.getObjectByName('Garage open bonnet')) throw new Error('Garage bonnet is already articulated.');
  const surface = (key: string): THREE.Mesh => {
    const matches = car.children.filter((object): object is THREE.Mesh =>
      object instanceof THREE.Mesh && object.userData.shadowKey === key);
    if (matches.length !== 1) throw new Error(`Garage bonnet cannot identify ${key}.`);
    return matches[0]!;
  };
  const primary = surface('-1:false:false:Primary');
  const trim = surface('-1:false:false:Trim1');
  const hood = components(primary.geometry).filter(({ bounds: b, triangles }) =>
    triangles.length === 3086 && b.min.x > -.70 && b.min.x < -.67 &&
    b.max.x > .67 && b.max.x < .70 && b.min.y > .62 && b.min.y < .64 &&
    b.max.y > .88 && b.max.y < .90 && b.min.z > .73 && b.min.z < .76 &&
    b.max.z > 1.97 && b.max.z < 2.00);
  const washers = components(trim.geometry).filter(({ bounds: b, triangles }) =>
    triangles.length === 420 && b.min.y > .87 && b.max.y < .90 &&
    b.min.z > .93 && b.max.z < .97 &&
    ((b.min.x > -.30 && b.max.x < -.27) || (b.min.x > .27 && b.max.x < .30)));
  if (hood.length !== 1 || washers.length !== 2) {
    throw new Error('Garage bonnet source components no longer match the audited AE86.');
  }
  // Prepare both partitions before replacing either hero mesh. In particular,
  // never setIndex() on a geometry still shared with the closed red car.
  const primarySplit = planSplit(primary, hood);
  const trimSplit = planSplit(trim, washers);
  const hinge = new THREE.Vector3(0, .883, .755);
  const group = new THREE.Group(); group.name = 'Garage open bonnet';
  const pivot = new THREE.Group(); pivot.name = 'Garage bonnet rear hinge';
  pivot.position.copy(hinge);
  pivot.rotation.x = -THREE.MathUtils.degToRad(angleDegrees);
  group.add(pivot);
  for (const [source, split, name] of [
    [primary, primarySplit, 'Garage authored bonnet'],
    [trim, trimSplit, 'Garage bonnet washer nozzles'],
  ] as const) {
    source.geometry = split.remaining;
    // The fleet callbacks close over its shared source and simplified indices.
    // These two POC replacements use full topology in both beauty and shadow.
    source.onBeforeShadow = () => {};
    source.onAfterShadow = () => {};
    delete source.userData.shadowIndexCount;
    // A translation changes only positions. BufferGeometry.translate() also
    // renormalizes normals; retaining their source bits avoids that extra edit.
    const position = split.moving.getAttribute('position');
    for (let vertex = 0; vertex < position.count; vertex++) {
      position.setXYZ(vertex, position.getX(vertex) - hinge.x,
        position.getY(vertex) - hinge.y, position.getZ(vertex) - hinge.z);
    }
    split.moving.computeBoundingBox();
    split.moving.computeBoundingSphere();
    const articulated = new THREE.Mesh(split.moving, source.material);
    articulated.name = name;
    articulated.castShadow = source.castShadow;
    articulated.receiveShadow = source.receiveShadow;
    articulated.userData.garageHood = true;
    pivot.add(articulated);
    if(source===primary){
      // The authored panel is an exterior sheet with folded lips, but has no
      // broad inner shell. Opposite culling supplies a separate inner coating
      // on that exact shape without overlapping same-facing beauty surfaces.
      const exterior=(source.material as THREE.MeshStandardMaterial).clone();
      exterior.side=THREE.FrontSide;
      // The original sheet is double-sided. Beauty uses separate coatings,
      // while its single shadow draw must still block light from either side.
      exterior.shadowSide=THREE.DoubleSide;articulated.material=exterior;
      const innerMaterial=new THREE.MeshStandardMaterial({name:'Hood / charcoal inner skin',
        color:'#555753',roughness:.84,metalness:.18,side:THREE.BackSide});
      const inner=new THREE.Mesh(split.moving,innerMaterial);inner.name='Garage bonnet inner skin';
      inner.castShadow=false;inner.receiveShadow=true;pivot.add(inner);
    }
  }
  car.add(group);
  return {
    group, pivot, hinge, bounds: hood[0]!.bounds.clone(),
    diagnostics: {
      hoodTriangles: primarySplit.moving.index!.count / 3,
      washerTriangles: trimSplit.moving.index!.count / 3,
      primarySourceTriangles: primarySplit.sourceCount,
      primaryRemainingTriangles: primarySplit.remaining.index!.count / 3,
      trimSourceTriangles: trimSplit.sourceCount,
      trimRemainingTriangles: trimSplit.remaining.index!.count / 3,
    },
  };
}
