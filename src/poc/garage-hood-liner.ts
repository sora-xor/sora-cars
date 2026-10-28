import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';

/** Stamped reinforcement under the real hood, expressed in closed car space. */
export function createGarageHoodLiner(hinge: THREE.Vector3): THREE.Group {
  const group = new THREE.Group(); group.name = 'Stamped hood inner frame';
  const iron = new THREE.MeshStandardMaterial({ color: '#383b3c', roughness: .76, metalness: .28 });
  iron.name = 'Hood / phosphate inner pressing';
  const enamel = new THREE.MeshStandardMaterial({ color: '#96907b', roughness: .69, metalness: .22 });
  enamel.name = 'Hood / exposed folded seams';
  const hardware = new THREE.MeshStandardMaterial({ color: '#a99c7f', roughness: .41, metalness: .73 });
  hardware.name = 'Hood / catches and fasteners';
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const point = (x:number,y:number,z:number) => new THREE.Vector3(x,y,z);
  // Height samples from raycasts against the authored panel, not a flat
  // guessed plane. Subdivision below lets the pressing follow its bowed skin.
  const profile=[[.86,.894],[.90,.889310],[1.20,.846341],[1.50,.793380],[1.70,.750249],[1.85,.709100]];
  const surfaceY = (z:number,x=0) => {
    let i=0;while(i<profile.length-2&&z>profile[i+1]![0]!)i++;
    const a=profile[i]!,b=profile[i+1]!;
    return THREE.MathUtils.lerp(a[1]!,b[1]!,(z-a[0]!)/(b[0]!-a[0]!))-.012*x*x;
  };
  function add(geometry:THREE.BufferGeometry, material:THREE.Material) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    const parts = batches.get(material) ?? []; parts.push(g); batches.set(material,parts);
  }
  function press(outline:number[][], holes:number[][][], material:THREE.Material, offset:number, depth:number) {
    const shape = new THREE.Shape(outline.map(p=>new THREE.Vector2(p[0]!,p[1]!)));
    for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(p=>new THREE.Vector2(p[0]!,p[1]!))));
    const source = new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:true,bevelSegments:1,bevelSize:.003,bevelThickness:.003});
    const g=new TessellateModifier(.07,6).modify(source);source.dispose();
    // Shape Y becomes longitudinal Z; extrusion points down into the bay.
    const positions=g.getAttribute('position');
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),z=positions.getY(i),thickness=positions.getZ(i);
      positions.setXYZ(i,x,surfaceY(z,x)-offset-thickness,z);
    }
    g.computeVertexNormals();add(g,material);
  }
  const outer=[[-.56,.86],[.56,.86],[.55,1.39],[.39,1.76],[-.39,1.76],[-.55,1.39]];
  const holes=[
    [[-.47,.96],[-.09,.96],[-.09,1.25],[-.47,1.29]],
    [[.09,.96],[.47,.96],[.47,1.29],[.09,1.25]],
    [[-.46,1.38],[-.085,1.35],[-.085,1.66],[-.34,1.66]],
    [[.085,1.35],[.46,1.38],[.34,1.66],[.085,1.66]],
  ];
  press(outer,holes,iron,.008,.017);
  // A smaller raised bead around each opening gives the stamped sheet actual
  // light-catching folds. It is not a normal-map imitation of the cavity.
  for (const loop of holes) {
    const cx=loop.reduce((s,p)=>s+p[0]!,0)/loop.length;
    const cz=loop.reduce((s,p)=>s+p[1]!,0)/loop.length;
    const expanded=loop.map(p=>[cx+(p[0]!-cx)*1.075,cz+(p[1]!-cz)*1.075]);
    press(expanded,[loop],enamel,.025,.007);
  }
  for (const x of [-.49,.49]) for (const z of [.905,1.34]) {
    const g=new THREE.CylinderGeometry(.009,.009,.006,6);
    g.translate(x,surfaceY(z,x)-.036,z);add(g,hardware);
  }
  // The bonnet latch loop and its bolted foot remain attached when opened.
  const latch=new THREE.TorusGeometry(.021,.004,6,18,Math.PI);
  latch.rotateZ(Math.PI); latch.rotateX(Math.PI/2); latch.translate(0,surfaceY(1.72)-.044,1.72);add(latch,hardware);
  for (const x of [-.028,.028]) {
    const g=new THREE.CylinderGeometry(.006,.006,.005,6);
    g.translate(x,surfaceY(1.72,x)-.030,1.72);add(g,hardware);
  }
  for (const [material,parts] of batches) {
    const g=mergeGeometries(parts,false);if(!g)throw new Error('Hood inner frame could not be assembled');
    parts.forEach(p=>p.dispose());g.translate(-hinge.x,-hinge.y,-hinge.z);
    g.computeBoundingBox();g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,material);mesh.name=material.name;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  }
  // Kept as a function for the caller's matching fixed prop rod.
  group.userData.propSocket=point(-.42,surfaceY(1.50,-.42)-.034,1.50).sub(hinge).toArray();
  return group;
}
