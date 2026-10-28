import * as THREE from 'three';

/** A thin, folded palmate blade. Use DoubleSide; the silhouette is actual geometry. */
export function createShorelineLeaf():THREE.BufferGeometry {
  const hubY=-.27;
  const points:THREE.Vector3[]=[];
  const valleys=[-138,-97,-58.5,-19.5,19.5,58.5,97,138];
  const valleyRadii=[.13,.135,.205,.27,.27,.205,.135,.13];
  const tips=[-116,-78,-39,0,39,78,116];
  const tipRadii=[.28,.53,.65,.77,.65,.53,.28];

  function bladePoint(degrees:number,radius:number) {
    const angle=THREE.MathUtils.degToRad(degrees);
    const x=Math.sin(angle)*radius,y=hubY+Math.cos(angle)*radius;
    // A raised vein junction and a shallow saddle give each lobe real changes of normal.
    // The asymmetrical curl avoids a perfectly flat or mechanically mirrored blade.
    const z=.026*(1-radius/.82)-.025*Math.pow(Math.abs(x)/.53,1.15)
      +.011*Math.sin(angle*3+.7)*radius/.77;
    points.push(new THREE.Vector3(x,y,z));
  }

  bladePoint(valleys[0],valleyRadii[0]);
  for(let lobe=0;lobe<tips.length;lobe++) {
    const left=valleys[lobe],tip=tips[lobe],right=valleys[lobe+1],radius=tipRadii[lobe];
    // Two small teeth interrupt each lobe's long pointed sides; deep valleys separate lobes.
    bladePoint(THREE.MathUtils.lerp(left,tip,.36),radius*.64);
    bladePoint(THREE.MathUtils.lerp(left,tip,.56),radius*.60);
    bladePoint(tip,radius);
    bladePoint(THREE.MathUtils.lerp(tip,right,.44),radius*.60);
    bladePoint(THREE.MathUtils.lerp(tip,right,.64),radius*.64);
    bladePoint(right,valleyRadii[lobe+1]);
  }
  // Continue the perimeter around a short tapered petiole, with its tip at y=-.5.
  for(const [x,y] of [[.018,-.42],[.017,-.49],[0,-.5],[-.017,-.49],[-.018,-.42]])
    points.push(new THREE.Vector3(x,y,.019+(y+.42)*.05));

  const vertices=[new THREE.Vector3(0,hubY,.026),...points];
  const bounds=new THREE.Box3().setFromPoints(vertices);
  const center=bounds.getCenter(new THREE.Vector3());
  const size=bounds.getSize(new THREE.Vector3());
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  for(const vertex of vertices) {
    positions.push(vertex.x-center.x,vertex.y-center.y,vertex.z-center.z);
    uvs.push((vertex.x-bounds.min.x)/size.x,(vertex.y-bounds.min.y)/size.y);
  }
  for(let i=0;i<points.length;i++) {
    // The polar perimeter runs clockwise in XY; reverse each fan triangle for +Z fronts.
    indices.push(0,(i+1)%points.length+1,i+1);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.name='Folded seven-lobe shoreline maple leaf';
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
