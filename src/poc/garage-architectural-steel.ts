import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface GarageArchitecturalSteelMaterials {
  panel: THREE.Material;
  frame: THREE.Material;
  fastener: THREE.Material;
}

/**
 * Actual folded sheet and structural profiles for the existing POC envelope.
 *
 * Replace the garage's left-wall .47m rod loop and the four 12.8m rectangular
 * ceiling beams with this assembly. Keep the structural wall/roof backing,
 * existing diagonal braces, rear header/shutter and side/back wall bounds.
 * All positions are in the existing garage's metre coordinates. Materials are
 * borrowed; this module never edits or disposes a caller-owned material.
 *
 * Three merged material batches (or fewer if the caller shares materials).
 * The folded surfaces use real normals and thickness; no picture planes,
 * floating outlines, per-vertex colour or additional full-frame pass.
 */
export function createGarageArchitecturalSteel(materials: GarageArchitecturalSteelMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Workshop structural steel: folded sheet, rolled joints and bolted purlins';
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const counts = { wallSheets: 0, roofSheets: 0, seams: 0, purlins: 0, gussets: 0, bolts: 0 };
  interface BakedBox { half: THREE.Vector3; centre: THREE.Vector3 }
  const put = (geometry: THREE.BufferGeometry, material: THREE.Material, transform?: THREE.Matrix4,
    edgeBox?: BakedBox) => {
    let prepared = geometry;
    if (geometry.index) { prepared = geometry.toNonIndexed(); geometry.dispose(); }
    if (transform) prepared.applyMatrix4(transform);
    // Every batch member carries the same attribute schema. Only actual
    // translated axis-aligned boxes receive positive extents; folded sheets,
    // gussets and fasteners explicitly disable the existing edge-paint field.
    const vertices = prepared.getAttribute('position').count;
    const boxes = new Float32Array(vertices * 4);
    const origins = new Float32Array(vertices * 4);
    if (edgeBox) {
      const { half, centre } = edgeBox;
      const seed = ((centre.x * 13.73 + centre.y * 27.11 + centre.z * 49.97
        + half.x * 91.31 + half.y * 53.71 + half.z * 19.17) % 97 + 97) % 97;
      for (let i = 0; i < vertices; i++) {
        boxes.set([half.x, half.y, half.z, 0], i * 4);
        origins.set([centre.x, centre.y, centre.z, seed], i * 4);
      }
    }
    prepared.setAttribute('workshopPaintBox', new THREE.Float32BufferAttribute(boxes, 4));
    prepared.setAttribute('workshopPaintOrigin', new THREE.Float32BufferAttribute(origins, 4));
    const batch = batches.get(material) ?? [];
    batch.push(prepared); batches.set(material, batch);
  };
  const box = (material: THREE.Material, width: number, height: number, depth: number,
    x: number, y: number, z: number) => {
    put(new THREE.BoxGeometry(width, height, depth), material, new THREE.Matrix4().makeTranslation(x, y, z),
      { half: new THREE.Vector3(width / 2, height / 2, depth / 2), centre: new THREE.Vector3(x, y, z) });
  };
  const basis = (origin: THREE.Vector3, u: THREE.Vector3, normal: THREE.Vector3, height: THREE.Vector3) => {
    const matrix = new THREE.Matrix4().makeBasis(u, normal, height);
    matrix.setPosition(origin); return matrix;
  };

  /** A thin closed prism through a folded cross-section. u is sheet width,
   *  y is the projection off its backing, z is the sheet's straight length.
   *  Each face is truly planar, making light separate the broad steel planes.
   */
  function foldedSheet(width: number, height: number, folds: number, relief: number): THREE.ExtrudeGeometry {
    const thickness = .0024;
    const profile: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
    for (let fold = 0; fold < folds; fold++) {
      const start = width * fold / folds, pitch = width / folds;
      for (const [fraction, projection] of [[.28, 0], [.39, relief], [.61, relief], [.72, 0], [1, 0]]) {
        profile.push(new THREE.Vector2(start + pitch * fraction!, projection!));
      }
    }
    const shape = new THREE.Shape();
    shape.moveTo(profile[0]!.x, profile[0]!.y);
    for (let i = 1; i < profile.length; i++) shape.lineTo(profile[i]!.x, profile[i]!.y);
    for (let i = profile.length - 1; i >= 0; i--) shape.lineTo(profile[i]!.x, profile[i]!.y - thickness);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: height, steps: 1, bevelEnabled: false, curveSegments: 1 });
  }

  // Existing wall's inner face is x=-6.175. Even the seam caps remain behind
  // x=-6.129, leaving at least 4mm clearance from the shelving at x=-6.125.
  // The rear end also clears the back wing's inner face at z=-5.87.
  // The three rows stop short of the rolled horizontal rails; no coplanar
  // sheets overlap at their joints.
  const wallStart = -5.84, wallEnd = 6.94, bays = 10;
  const bayPitch = (wallEnd - wallStart) / bays;
  const rowRanges = [[.17, 1.565], [1.655, 3.155], [3.245, 4.785]] as const;
  for (let bay = 0; bay < bays; bay++) {
    const start = wallStart + bay * bayPitch + .018;
    const width = bayPitch - .036;
    for (const [bottom, top] of rowRanges) {
      put(foldedSheet(width, top - bottom, 5, .010), materials.panel,
        basis(new THREE.Vector3(-6.169, bottom, start), new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
      counts.wallSheets++;
    }
  }
  // Standing seams use a visible cap with two return folds. The three pieces
  // meet at edges; their face surfaces do not overlap.
  for (let bay = 0; bay <= bays; bay++) {
    const z = wallStart + bay * bayPitch;
    for (const [bottom, top] of rowRanges) {
      box(materials.frame, .0035, top - bottom, .028, -6.135, (bottom + top) / 2, z);
      for (const sign of [-1, 1]) box(materials.frame, .0305, top - bottom, .003,
        -6.152, (bottom + top) / 2, z + sign * .0155);
    }
    counts.seams++;
  }
  // Horizontal folded bands sit in the reserved gaps between sheet rows.
  for (const y of [.125, 1.61, 3.20, 4.83]) {
    box(materials.frame, .0035, .066, wallEnd - wallStart, -6.135, y, (wallStart + wallEnd) / 2);
    for (const sign of [-1, 1]) box(materials.frame, .0305, .003, wallEnd - wallStart,
      -6.152, y + sign * .0345, (wallStart + wallEnd) / 2);
    counts.seams++;
  }

  /** Flush hex head with a shallow washer. axis points out of its plate. */
  const bolt = (x: number, y: number, z: number, axis: THREE.Vector3, radius = .009) => {
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    const matrix = (distance: number) => new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z).addScaledVector(axis, distance), rotation, new THREE.Vector3(1, 1, 1));
    put(new THREE.CylinderGeometry(radius * 1.28, radius * 1.28, .002, 12), materials.fastener, matrix(.001));
    put(new THREE.CylinderGeometry(radius, radius, .006, 6), materials.fastener, matrix(.005));
    counts.bolts++;
  };
  const inward = new THREE.Vector3(1, 0, 0);
  for (let bay = 0; bay <= bays; bay++) {
    const z = wallStart + bay * bayPitch;
    for (const y of [.36, 1.40, 1.83, 2.97, 3.42, 4.57]) bolt(-6.13325, y, z, inward, .007);
  }

  // The existing roof backing starts at y=4.89. Shallow folded soffit panels
  // fit entirely below it and stop 2cm before the actual I-section purlins.
  // The first sheet begins beyond the rolled shutter's front face z=-5.685.
  const roofRanges = [[-5.66, -2.71], [-2.49, 1.09], [1.31, 4.49], [4.71, 6.94]] as const;
  for (const [front, back] of roofRanges) {
    for (const start of [-6.10, .006]) {
      put(foldedSheet(6.094, back - front, 18, .009), materials.panel,
        basis(new THREE.Vector3(start, 4.884, back), new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1)));
      counts.roofSheets++;
    }
  }

  // Original beam bounds: x=+-6.4, y=4.7..4.9, z=bay+-0.09. Three touching
  // solids form each actual I-section; the web is recessed from both flanges.
  const purlinPositions = [-5.85, -2.6, 1.2, 4.6];
  for (const z of purlinPositions) {
    box(materials.frame, 12.8, .024, .18, 0, 4.712, z);
    box(materials.frame, 12.8, .154, .024, 0, 4.801, z);
    box(materials.frame, 12.8, .022, .18, 0, 4.889, z);
    counts.purlins++;
    // Pair of web stiffeners at each knee. Front plates sit on the web at
    // z+0.013; mirrored plates sit behind it. Their surfaces remain separate
    // from the flange faces and the retained diagonal brace cylinders.
    for (const side of [-1, 1]) {
      for (const facing of [-1, 1]) {
        const shape = new THREE.Shape();
        shape.moveTo(-.19, -.071); shape.lineTo(.19, -.071);
        shape.lineTo(.15, .071); shape.lineTo(-.15, .071); shape.closePath();
        const plate = new THREE.ExtrudeGeometry(shape, { depth: .005, bevelEnabled: false, steps: 1 });
        put(plate, materials.frame, new THREE.Matrix4().makeTranslation(side * 5.0, 4.801,
          z + (facing === 1 ? .013 : -.018)));
        counts.gussets++;
        for (const dx of [-.105, .105]) for (const dy of [-.044, .044]) {
          bolt(side * 5.0 + dx, 4.801 + dy, z + facing * .018,
            new THREE.Vector3(0, 0, facing), .008);
        }
      }
    }
  }

  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries, false);
    if (!geometry) throw new Error('Could not batch workshop structural steel geometry.');
    geometries.forEach(part => part.dispose());
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    // Do not impersonate prepareWorkshopEdgePaint's private version marker:
    // that helper may classify this merged BufferGeometry as unsupported, but
    // it leaves these already baked attributes intact for the material shader.
    geometry.userData.workshopArchitecturalEdgeBounds = true;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = material === materials.panel ? 'Folded wall and roof sheet' :
      (material === materials.frame ? 'Rolled seams and I-section purlins' : 'Structural hex fasteners');
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  }
  root.userData.architecturalSteel = { ...counts, drawBatches: root.children.length,
    wallInnerLimit: -6.12525, bounds: { x: [-6.4, 6.4], y: [.089, 4.9], z: [-5.94, 6.957] } };
  return root;
}
