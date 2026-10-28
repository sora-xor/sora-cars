import * as THREE from 'three';

export type WorkshopEdgeFamily = 'steel' | 'timber' | 'cabinet';

const EDGE_PAINT_VERSION = 1;
const FAMILY_NUMBER: Record<WorkshopEdgeFamily, number> = { steel: 1, timber: 2, cabinet: 3 };

/** Deliberately opt in: generic dark or metallic materials include car parts. */
export function pickWorkshopEdgeFamily(material: THREE.Material): WorkshopEdgeFamily | null {
  if (!(material instanceof THREE.MeshStandardMaterial) || material.transparent || material.opacity < 1
    || material.name === 'Primary' || material.userData.garageLeafPaint || material.userData.garagePaintedFloor
    || (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0)) return null;
  const selected: unknown = material.userData.workshopEdgePaint;
  if (selected === 'steel' || selected === 'timber' || selected === 'cabinet') return selected;
  return material.name === 'Painted workshop enamel' ? 'steel' : null;
}

export interface WorkshopEdgePaintDiagnostics {
  meshesPrepared: number;
  meshesAlreadyPrepared: number;
  unsupportedMeshes: number;
  vertices: number;
  triangles: number;
  families: Record<WorkshopEdgeFamily, number>;
}

/**
 * Prepare only box and rounded-box workshop construction. Their measured bounds
 * and original bevel radius define a narrow distance field on the real form.
 * This avoids interpolating a corner-curvature mask over a large, sparse flat
 * face (which would mark the whole panel). A shader derivative of the original
 * normal distinguishes the actual bevel from the adjacent planar lip.
 *
 * Original positions, normals, UVs, indices, groups, draw range, and vertex /
 * triangle counts are preserved byte-for-byte in owned geometry clones. Rods,
 * imported arbitrary props, skinned meshes and cars are deliberately unsupported.
 * An unsupported mesh using the same material has zero box extents through the
 * shader's default attribute values and therefore receives no edge paint.
 */
export function prepareWorkshopEdgePaint(root: THREE.Object3D): WorkshopEdgePaintDiagnostics {
  const result: WorkshopEdgePaintDiagnostics = {
    meshesPrepared: 0, meshesAlreadyPrepared: 0, unsupportedMeshes: 0,
    vertices: 0, triangles: 0, families: { steel: 0, timber: 0, cabinet: 0 },
  };
  const assignments: Array<{ mesh: THREE.Mesh; geometry: THREE.BufferGeometry; family: WorkshopEdgeFamily }> = [];
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const families = materials.map(pickWorkshopEdgeFamily);
    if (!families.some(Boolean)) return;
    // Mixed selected/unselected groups are safe (the shader is material scoped),
    // but one shared mesh must use one edge family for its construction.
    const family = families.find((value): value is WorkshopEdgeFamily => value !== null)!;
    const source = object.geometry;
    if (source.userData.workshopEdgePaintVersion === EDGE_PAINT_VERSION
      && source.getAttribute('workshopPaintBox')?.count === source.getAttribute('position')?.count
      && source.getAttribute('workshopPaintOrigin')?.count === source.getAttribute('position')?.count) {
      result.meshesAlreadyPrepared++;
      return;
    }
    if (object instanceof THREE.SkinnedMesh || !['BoxGeometry', 'RoundedBoxGeometry'].includes(source.type)
      || families.some(value => value !== null && value !== family)) {
      result.unsupportedMeshes++;
      return;
    }
    const positions = source.getAttribute('position');
    const normals = source.getAttribute('normal');
    if (!positions || positions.itemSize !== 3 || !normals || normals.count !== positions.count) {
      result.unsupportedMeshes++;
      return;
    }
    const bounds = new THREE.Box3().setFromBufferAttribute(positions as THREE.BufferAttribute);
    const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(.5);
    const centre = bounds.getCenter(new THREE.Vector3());
    if (![half.x, half.y, half.z, centre.x, centre.y, centre.z].every(Number.isFinite)
      || Math.min(half.x, half.y, half.z) <= 0) throw new Error('Workshop edge paint requires finite, nonzero box extents.');
    const parameters = (source as THREE.BoxGeometry & { parameters: { radius?: number } }).parameters;
    const radius = source.type === 'RoundedBoxGeometry' ? Math.max(0, parameters.radius ?? 0) : 0;
    const core = half.clone().addScalar(-radius);
    const tolerance = Math.max(1e-5, half.length() * 1e-6);
    let matchesMeasuredForm = radius <= Math.min(half.x, half.y, half.z) + tolerance;
    for (let i = 0; i < positions.count && matchesMeasuredForm; i++) {
      const qx = Math.abs(positions.getX(i) - centre.x) - core.x;
      const qy = Math.abs(positions.getY(i) - centre.y) - core.y;
      const qz = Math.abs(positions.getZ(i) - centre.z) - core.z;
      const distance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0))
        + Math.min(Math.max(qx, qy, qz), 0) - radius;
      const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);
      matchesMeasuredForm = Math.abs(distance) <= tolerance && [nx, ny, nz].every(Number.isFinite);
      if (radius > tolerance) {
        const ex = Math.max(qx, 0) * Math.sign(positions.getX(i) - centre.x);
        const ey = Math.max(qy, 0) * Math.sign(positions.getY(i) - centre.y);
        const ez = Math.max(qz, 0) * Math.sign(positions.getZ(i) - centre.z);
        matchesMeasuredForm &&= (nx * ex + ny * ey + nz * ez)
          / Math.max(Math.hypot(ex, ey, ez) * Math.hypot(nx, ny, nz), 1e-10) > .995;
      } else {
        matchesMeasuredForm &&= Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz))
          / Math.max(Math.hypot(nx, ny, nz), 1e-10) > .9999;
      }
    }
    // A typed BoxGeometry may have had arbitrary vertex deformation baked into
    // it. Never treat its bounding rectangle as the actual painted form.
    if (!matchesMeasuredForm) { result.unsupportedMeshes++; return; }
    // Save initial placement into the geometry. Moving an object later does not
    // slide its marks; differently placed repeated boards do not repeat a stamp.
    const e = object.matrixWorld.elements;
    const seed = ((e[12]! * 13.73 + e[13]! * 27.11 + e[14]! * 49.97
      + half.x * 91.31 + half.y * 53.71 + half.z * 19.17) % 97 + 97) % 97;
    const box = new Float32Array(positions.count * 4);
    const origin = new Float32Array(positions.count * 4);
    for (let i = 0; i < positions.count; i++) {
      box.set([half.x, half.y, half.z, radius], i * 4);
      origin.set([centre.x, centre.y, centre.z, seed], i * 4);
    }
    const geometry = source.clone();
    geometry.setAttribute('workshopPaintBox', new THREE.Float32BufferAttribute(box, 4));
    geometry.setAttribute('workshopPaintOrigin', new THREE.Float32BufferAttribute(origin, 4));
    geometry.userData = { ...source.userData, workshopEdgePaintVersion: EDGE_PAINT_VERSION };
    assignments.push({ mesh: object, geometry, family });
  });
  // Validate every selected shape before changing any geometry assignment.
  for (const { mesh, geometry, family } of assignments) {
    mesh.geometry = geometry;
    result.meshesPrepared++;
    result.families[family]++;
    result.vertices += geometry.getAttribute('position').count;
    result.triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
  }
  return result;
}

/** Shared control; strength stays zero until an inspected A/B selects a value. */
export function createWorkshopEdgePaintControl() {
  const strength = { value: 0 };
  return {
    setStrength(value: number) { strength.value = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0; },
    uniforms(family: WorkshopEdgeFamily) {
      return { soraWorkshopEdgeStrength: strength, soraWorkshopEdgeFamily: { value: FAMILY_NUMBER[family] } };
    },
    stats() { return { strength: strength.value }; },
  };
}

export const workshopEdgeVertexDeclarations = /* glsl */`
  attribute vec4 workshopPaintBox;
  attribute vec4 workshopPaintOrigin;
  varying vec3 vWorkshopEdgePosition;
  varying vec3 vWorkshopEdgeNormal;
  varying vec4 vWorkshopEdgeBox;
  varying vec2 vWorkshopEdgeSeedUp;
`;

/** Insert after begin_vertex (stock defaultnormal_vertex has already run). */
export const workshopEdgeVertex = /* glsl */`
  mat3 workshopEdgeBasis=mat3(modelMatrix);
  #ifdef USE_INSTANCING
    workshopEdgeBasis=workshopEdgeBasis*mat3(instanceMatrix);
  #endif
  vec3 workshopEdgeScale=vec3(length(workshopEdgeBasis[0]),length(workshopEdgeBasis[1]),length(workshopEdgeBasis[2]));
  vWorkshopEdgePosition=(position-workshopPaintOrigin.xyz)*workshopEdgeScale;
  vWorkshopEdgeBox=vec4(workshopPaintBox.xyz*workshopEdgeScale,
    workshopPaintBox.w*min(workshopEdgeScale.x,min(workshopEdgeScale.y,workshopEdgeScale.z)));
  vWorkshopEdgeNormal=normal;
  // Stock transformedNormal already handles inverse instance scale and model
  // normalMatrix. Rotate it back to world space solely to identify upper lips.
  vWorkshopEdgeSeedUp=vec2(workshopPaintOrigin.w,
    inverseTransformDirection(transformedNormal,viewMatrix).y);
`;

export const workshopEdgeDeclarations = /* glsl */`
  uniform float soraWorkshopEdgeStrength;
  uniform float soraWorkshopEdgeFamily;
  varying vec3 vWorkshopEdgePosition;
  varying vec3 vWorkshopEdgeNormal;
  varying vec4 vWorkshopEdgeBox;
  varying vec2 vWorkshopEdgeSeedUp;

  // x: warm broken catch, y: cool lower seam. Interior flat fill stays zero.
  vec2 workshopEdgeCoverage(){
    vec3 halfSize=vWorkshopEdgeBox.xyz;
    if(min(halfSize.x,min(halfSize.y,halfSize.z))<=0.)return vec2(0.);
    vec3 p=vWorkshopEdgePosition;
    vec3 gap=max(halfSize-abs(p),vec3(0.));
    vec3 edgeDistance=vec3(length(gap.yz),length(gap.xz),length(gap.xy));
    float distanceToEdge=min(edgeDistance.x,min(edgeDistance.y,edgeDistance.z));
    bool alongX=edgeDistance.x<=edgeDistance.y&&edgeDistance.x<=edgeDistance.z;
    bool alongY=!alongX&&edgeDistance.y<=edgeDistance.z;
    float along=alongX?p.x:(alongY?p.y:p.z);
    vec2 across=alongX?p.yz:(alongY?p.xz:p.xy);
    float seed=vWorkshopEdgeSeedUp.x;
    // Read the existing authored chisel shapes in an edge-tangent frame.
    // Opposite lips use different fixed texture rows; object/camera motion
    // cannot slide the pattern. There are no regular dash cells or pixel noise.
    float row=seed*.173+sign(across.x)*.271+sign(across.y)*.391;
    float mark=authoredPaintMarks(vec3(along*.8,row,0.),vec3(0.,0.,1.));
    float markAA=clamp(fwidth(mark)*.5,.015,.12);
    float stroke=smoothstep(.43-markAA,.62+markAA,mark);
    float familyWidth=soraWorkshopEdgeFamily<1.5?.0018:
      (soraWorkshopEdgeFamily<2.5?.003:.0015);
    // A circular bevel crown lies r*(sqrt(2)-1) from the virtual sharp edge.
    // Place only 1.5–3mm of paint above that distance, tapering with the authored
    // mark. The old centimetre width spilled onto adjacent flat faces and read
    // as copper trim. Flat faces away from their physical lips stay untouched.
    float paintWidth=familyWidth*stroke;
    float width=vWorkshopEdgeBox.w*.41421356+paintWidth;
    float acrossAA=max(fwidth(distanceToEdge)*.65,.0005);
    float edge=1.-smoothstep(width-acrossAA,width+acrossAA,distanceToEdge);
    // Fade by paint thickness, not bevel radius: a broad rounded edge must not
    // keep an unresolved hairline opaque at long distance.
    float resolve=clamp(paintWidth/max(acrossAA,.0005),0.,1.);
    // The real interpolated geometric normals identify bevels. Unlike an
    // interpolated vertex-curvature attribute, this is zero on a large flat.
    float curvature=max(length(dFdx(vWorkshopEdgeNormal))/max(length(dFdx(p)),.0001),
      length(dFdy(vWorkshopEdgeNormal))/max(length(dFdy(p)),.0001));
    float bevel=smoothstep(2.,35.,curvature);
    float upper=smoothstep(-.08,.32,p.y/max(halfSize.y,.0001));
    float up=smoothstep(-.1,.7,vWorkshopEdgeSeedUp.y);
    float warmPreference=.16+.84*max(up,upper*.75);
    float lowerPreference=(1.-upper)*(.3+.7*(1.-up));
    return vec2(edge*stroke*warmPreference*(.55+bevel*.45),
      edge*(.35+stroke*.65)*lowerPreference)*resolve;
  }

  /** Pass the accumulated ORIGINAL physical diffuse, before authored ramps.
   *  It supplies all light energy. A completely unlit catch remains black.
   *  Apply once to summed styled diffuse, then retain its direct/indirect split.
   */
  vec3 workshopEdgePaintDiffuse(vec3 styledDiffuse,vec3 physicalDiffuse,vec3 albedo,float enabled){
    float amount=soraWorkshopEdgeStrength*enabled;
    if(amount<=0.)return styledDiffuse;
    vec2 coverage=workshopEdgeCoverage()*amount;
    vec3 warmPigment=soraWorkshopEdgeFamily<1.5?vec3(.43,.33,.22):
      (soraWorkshopEdgeFamily<2.5?vec3(.47,.30,.15):vec3(.58,.27,.11));
    vec3 incident=max(physicalDiffuse,vec3(0.))/max(albedo,vec3(.025));
    vec3 caughtPaint=incident*warmPigment;
    // Author narrow warm exposed paint and violet lower edges. Neither layer
    // adds emission; the existing shadow maps/AO still act on final diffuse.
    vec3 result=styledDiffuse*mix(vec3(1.),vec3(.70,.76,.95),coverage.y*.42);
    return mix(result,max(result,caughtPaint),coverage.x*.76);
  }
`;
