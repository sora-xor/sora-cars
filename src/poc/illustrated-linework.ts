import * as THREE from 'three';

/**
 * POC adaptation of Never's End, GDC 2026, slides 19–32:
 * https://media.gdcvault.com/gdc2026/Slides/Juckett_Ryan_HowWeDrawA3DSpriteWorldTheStylizedArtOfNeversEnd.pdf
 * Opaque geometry supplies object/material boundaries independently of texture
 * detail. The post shader marks the nearer side, using each material's ink.
 * This is not the talk's complete deferred renderer or sprite sorting system.
 */
export type IllustratedInkStyle = {
  /** False still writes occlusion, but prevents this surface generating ink. */
  enabled?: boolean;
  /** CSS/hex color, authored in sRGB like THREE.Color's constructor. */
  color?: THREE.ColorRepresentation;
  strength?: number;
  /** Shared keys suppress outlines between equivalent material instances. */
  materialKey?: string;
};

export const illustratedLineworkDeclarations = /* glsl */`
uniform sampler2D illustratedIds;
uniform sampler2D illustratedInk;
uniform sampler2D illustratedNormals;
uniform sampler2D illustratedDepth;
uniform sampler2D illustratedBeautyDepth;
uniform vec2 illustratedResolution;
uniform float illustratedPixelSize;
uniform vec2 illustratedDistanceFade;
uniform float illustratedNear;
uniform float illustratedFar;
uniform float illustratedPerspective;
uniform float illustratedLineStrength;
uniform float illustratedInlineStrength;
uniform float illustratedCreaseStrength;
uniform float illustratedContrastSuppression;
uniform mat4 illustratedProjectionInverse;
uniform vec3 illustratedInlineKeyView;
uniform float illustratedBeautyDepthEnabled;

vec2 illustratedGridUv(vec2 uv) {
  vec2 resolution = max(illustratedResolution, vec2(1.));
  float size = max(1., illustratedPixelSize);
  vec2 native = clamp(floor(uv * resolution) + .5, vec2(.5), resolution - .5);
  vec2 p = floor(floor(native / size) * size + size * .5) + .5;
  return clamp(p, vec2(.5), resolution - .5) / resolution;
}

vec2 illustratedReadIds(vec2 uv) {
  vec4 bytes = floor(texture2D(illustratedIds, uv) * 255. + .5);
  return vec2(bytes.r + 256. * bytes.g, bytes.b + 256. * bytes.a);
}
float illustratedViewDepth(float d) {
  float perspective = illustratedNear * illustratedFar /
    max(illustratedFar - d * (illustratedFar - illustratedNear), .00001);
  return mix(mix(illustratedNear, illustratedFar, d), perspective, illustratedPerspective);
}
`;

export const illustratedLineworkCompose = /* glsl */`
// The beauty color and ink are sRGB. Pass 1 - visible glass coverage as the last
// argument: ordinary transparent surfaces are absent from the ID pass; dense
// emissive covers write zero-ink coverage to hide internal reflector contours.
vec3 applyIllustratedLinework(vec3 srgb, vec2 uv, float uncoveredByGlass) {
  vec4 ink = texture2D(illustratedInk, uv);
  float d = texture2D(illustratedDepth, uv).r;
  if (ink.a <= 0. || d >= .999999 ||
    (illustratedLineStrength <= 0. && illustratedInlineStrength <= 0. && illustratedCreaseStrength <= 0.)) return srgb;
  vec2 ids = illustratedReadIds(uv);
  float center = illustratedViewDepth(d);
  // IDs must stay nearest sampled and un-antialiased: averaging object IDs
  // would invent boundaries. At an MSAA silhouette the beauty depth can name
  // a different surface. Suppress ink there instead of drawing a detached halo.
  if (illustratedBeautyDepthEnabled > .5) {
    float beautyDepth = illustratedViewDepth(texture2D(illustratedBeautyDepth, uv).r);
    if (abs(beautyDepth - center) > .025 + center * .002) return srgb;
  }
  float distanceFade = 1. - smoothstep(illustratedDistanceFade.x, illustratedDistanceFade.y, center);
  if (distanceFade <= 0.) return srgb;
  vec2 pixel = max(1., illustratedPixelSize) / max(illustratedResolution, vec2(1.));
  float edge = 0.;
  vec4 normalSample = texture2D(illustratedNormals, uv);
  vec3 centerNormal = normalize(normalSample.xyz * 2. - 1.);
  float centerFacing = dot(centerNormal, illustratedInlineKeyView);
  float inlineEdge = 0.;
  float creaseEdge = 0.;
  float inlineClear = normalSample.a > .5 ? 1. : 0.;
  vec4 centerView = illustratedProjectionInverse * vec4(uv * 2. - 1., d * 2. - 1., 1.);
  vec3 centerPosition = centerView.xyz / centerView.w;
  for (int i = 0; i < 4; i++) {
    vec2 axis = i == 0 ? vec2(1., 0.) : i == 1 ? vec2(-1., 0.) :
      i == 2 ? vec2(0., 1.) : vec2(0., -1.);
    vec2 otherUv = illustratedGridUv(uv + axis * pixel);
    vec2 oppositeUv = illustratedGridUv(uv - axis * pixel);
    vec2 otherIds = illustratedReadIds(otherUv);
    float otherRaw = texture2D(illustratedDepth, otherUv).r;
    float other = illustratedViewDepth(otherRaw);
    float oppositeRaw = texture2D(illustratedDepth, oppositeUv).r;
    float opposite = illustratedViewDepth(oppositeRaw);
    // A plane's first-order depth slope is not a contour. Estimate it from
    // the opposite sample; geometric occlusions survive this cancellation.
    float threshold = .022 + center * .0018;
    float slope = oppositeRaw >= .999999 ? 0. : min(abs(opposite - center), threshold * 6.);
    float depthEdge = smoothstep(threshold, threshold * 1.7,
      other - center - slope * 1.6);
    float depthTie = .001 + center * .00005;
    bool nearer = center < other - depthTie;
    bool coplanar = abs(center - other) <= depthTie;
    bool differentObject = abs(ids.x - otherIds.x) > .5;
    bool differentMaterial = abs(ids.y - otherIds.y) > .5;
    vec3 otherColor = texture2D(tDiffuse, otherUv).rgb;
    float contrastScale = 1. - clamp(illustratedContrastSuppression, 0., 1.) *
      smoothstep(.16, .45, length(srgb - otherColor));
    if (illustratedInlineStrength > 0. || illustratedCreaseStrength > 0.) {
      vec4 otherNormalSample = texture2D(illustratedNormals, otherUv);
      // A selected inline lives within one surface family. All four neighbors
      // must belong to that family, so silhouettes/material outlines never
      // acquire a second, bright rim. Depth compatibility also rejects overlaps
      // between disconnected pieces which happen to share the same IDs.
      float compatible = !differentObject && !differentMaterial && otherRaw < .999999 &&
        otherNormalSample.a > .5 && abs(other - center) < threshold * 1.5 * max(1., illustratedPixelSize) ? 1. : 0.;
      if (illustratedBeautyDepthEnabled > .5) {
        float otherBeauty = illustratedViewDepth(texture2D(illustratedBeautyDepth, otherUv).r);
        compatible *= abs(otherBeauty - other) <= .025 + other * .002 ? 1. : 0.;
      }
      inlineClear *= compatible;
      vec3 otherNormal = normalize(otherNormalSample.xyz * 2. - 1.);
      float bend = smoothstep(.012, .10, 1. - dot(centerNormal, otherNormal));
      // A crease is a concave geometric fold, not a dark mark in a texture.
      // Reconstruct its neighbor in view space: above the tangent plane is
      // concave; below it is convex. Mark one side, selected by key facing.
      vec4 otherView = illustratedProjectionInverse * vec4(otherUv * 2. - 1., otherRaw * 2. - 1., 1.);
      vec3 delta = otherView.xyz / otherView.w - centerPosition;
      float concavity = smoothstep(.025, .18, dot(centerNormal, delta / max(length(delta), .00001)));
      float darkerSide = step(centerFacing + .001, dot(otherNormal, illustratedInlineKeyView));
      creaseEdge = max(creaseEdge, compatible * bend * concavity * darkerSide * contrastScale);
      // Only the brighter side of a bend receives the warm paint catch. The
      // light direction rotates into view space with the camera, while the
      // encoded normals come from the stock geometry normal transforms.
      float litSide = smoothstep(.035, .24,
        centerFacing - dot(otherNormal, illustratedInlineKeyView));
      inlineEdge = max(inlineEdge, compatible * bend * litSide *
        smoothstep(.10, .55, centerFacing));
    }
    // At an almost coplanar boundary only one side draws, so a one-pixel line
    // does not accidentally become two. IDs stay stable while the camera moves.
    float objectEdge = differentObject && (nearer || (coplanar && ids.x < otherIds.x)) ? 1. : 0.;
    float materialEdge = !differentObject && differentMaterial &&
      (nearer || (coplanar && ids.y < otherIds.y)) ? .8 : 0.;
    edge = max(edge, max(depthEdge, max(objectEdge, materialEdge)) * contrastScale);
  }
  float amount = edge * ink.a * distanceFade * clamp(illustratedLineStrength, 0., 1.) *
    clamp(uncoveredByGlass, 0., 1.);
  float creaseAmount = creaseEdge * ink.a * distanceFade * clamp(illustratedCreaseStrength, 0., 1.) *
    clamp(uncoveredByGlass, 0., 1.);
  // Existing high-contrast boundaries already read as drawn separation.
  // Keep new ink strongest where geometry would otherwise disappear.
  amount = max(amount, creaseAmount);
  vec3 inked = mix(srgb, min(srgb, ink.rgb), amount);
  float inlineAmount = inlineEdge * inlineClear * (1. - clamp(edge, 0., 1.)) *
    clamp(illustratedInlineStrength, 0., 1.) * distanceFade *
    clamp(uncoveredByGlass, 0., 1.) * .78;
  // Retain the local painted color: this is a small warm light catch, never a
  // fixed white outline. Existing dark ink remains authoritative above.
  vec3 warmPaint = min(vec3(1.), srgb * vec3(1.10, 1.07, 1.02) + vec3(.085, .058, .027));
  return mix(inked, warmPaint, inlineAmount);
}
`;

type SourceMaterial = THREE.Material & {
  color?: THREE.Color;
  map?: THREE.Texture | null;
  alphaMap?: THREE.Texture | null;
  transmission?: number;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  emissiveMap?: THREE.Texture | null;
};
type MaterialEntry = {
  source: SourceMaterial;
  material: THREE.MeshBasicMaterial;
  ids: { value: THREE.Vector4 };
  ink: { value: THREE.Vector4 };
  inlineMask: { value: number };
};
type ProxyEntry = { source: THREE.Mesh; proxy: THREE.Mesh; materials: MaterialEntry[] };

/**
 * Owns a geometry G-buffer and proxies; never owns source geometry or textures.
 * Stock skin/morph/instance transforms and alpha tests are supported. Custom
 * vertex displacement or fragment discard hooks need a matching ID material
 * before this is adopted outside the current POC's opaque, fixed geometry.
 */
export function createIllustratedLinework(renderer: THREE.WebGLRenderer) {
  const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  depth.minFilter = depth.magFilter = THREE.NearestFilter;
  const target = new THREE.WebGLRenderTarget(1, 1, {
    count: 3, type: THREE.UnsignedByteType, depthTexture: depth,
    depthBuffer: true, stencilBuffer: false, samples: 0,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    generateMipmaps: false,
  });
  target.textures[0].name = 'Illustrated object and material IDs';
  target.textures[1].name = 'Illustrated material ink';
  target.textures[2].name = 'Illustrated view normals and inline eligibility';
  for (const texture of target.textures) texture.colorSpace = THREE.NoColorSpace;
  const proxyScene = new THREE.Scene();
  const proxies = new Map<THREE.Mesh, ProxyEntry>();
  const styles = new WeakMap<THREE.Material, IllustratedInkStyle>();
  const objectRoots = new WeakSet<THREE.Object3D>();
  const objectIds = new WeakMap<THREE.Object3D, number>();
  const materialIds = new Map<string, number>();
  const clearColor = new THREE.Color(), viewport = new THREE.Vector4(), scissor = new THREE.Vector4();
  // Workshop's warm front/overhead key, expressed toward the source light.
  const inlineKeyWorld = new THREE.Vector3(.20, .78, .58).normalize();
  let width = 1, height = 1, nextObjectId = 1, disposed = false;
  const uniforms = {
    illustratedIds: { value: target.textures[0] },
    illustratedInk: { value: target.textures[1] },
    illustratedNormals: { value: target.textures[2] },
    illustratedDepth: { value: depth },
    illustratedBeautyDepth: { value: depth },
    illustratedResolution: { value: new THREE.Vector2(1, 1) },
    illustratedPixelSize: { value: 1 },
    illustratedDistanceFade: { value: new THREE.Vector2(28, 80) },
    illustratedNear: { value: .08 },
    illustratedFar: { value: 300 },
    illustratedPerspective: { value: 1 },
    illustratedLineStrength: { value: 1 },
    illustratedInlineStrength: { value: 0 },
    illustratedCreaseStrength: { value: 0 },
    illustratedContrastSuppression: { value: 0 },
    illustratedProjectionInverse: { value: new THREE.Matrix4() },
    illustratedInlineKeyView: { value: inlineKeyWorld.clone() },
    illustratedBeautyDepthEnabled: { value: 0 },
  };

  function paintedBackgroundInk(source: THREE.Mesh, material: THREE.Material) {
    // These shaders already choose their painted color shapes and silhouettes.
    // Reconstructing black lines from their finely tessellated geometry reveals
    // radial height-field facets and destroys atmospheric depth. They still
    // render exact IDs/depth below; only their own ink generation is disabled.
    if (/distant (?:terrain|lake)|painted dusk (?:clouds|sky)/i.test(material.name) ||
      material.userData.illustratedLineworkRole === 'painted-background') return 0;
    let scale = material.userData.garageLeafPaint ? .18 : 1;
    for (let ancestor: THREE.Object3D | null = source; ancestor; ancestor = ancestor.parent) {
      if (ancestor.userData.illustratedLineworkRole === 'painted-background' ||
        /garage distant terrain and water|painted dusk sky|(?:^|\b)fuji cone|violet ridge range|blue foothills|lakeshore ridges|lake with broken warm glints/i.test(ancestor.name)) return 0;
      if (/layered maple shoreline|shoreline maple|sloping real shoreline/i.test(ancestor.name)) scale = Math.min(scale, .18);
    }
    return scale;
  }

  function idForObject(source: THREE.Mesh, scene: THREE.Scene) {
    let root: THREE.Object3D = scene;
    for (let ancestor: THREE.Object3D | null = source; ancestor && ancestor !== scene; ancestor = ancestor.parent) {
      if (objectRoots.has(ancestor)) { root = ancestor; break; }
      // Independent props/cars share a parent Group. Direct scene meshes share
      // the environment ID, avoiding a new outline for every beam or bolt.
      if (ancestor.parent === scene && !('isMesh' in ancestor)) root = ancestor;
    }
    let id = objectIds.get(root);
    if (id === undefined) {
      if (nextObjectId > 65535) throw new Error('Illustrated linework object ID capacity exceeded');
      id = nextObjectId++; objectIds.set(root, id);
    }
    return id;
  }

  function makeMaterial(source: SourceMaterial): MaterialEntry {
    const material = new THREE.MeshBasicMaterial({
      name: `Illustrated IDs / ${source.name || source.type}`,
      color: 0xffffff, toneMapped: false, fog: false,
      blending: THREE.NoBlending, depthWrite: true, depthTest: true,
    });
    const ids = { value: new THREE.Vector4() }, ink = { value: new THREE.Vector4() };
    const inlineMask = { value: 0 };
    material.onBeforeCompile = shader => {
      shader.uniforms.soraIllustratedIds = ids;
      shader.uniforms.soraIllustratedInk = ink;
      shader.uniforms.soraIllustratedInlineMask = inlineMask;
      shader.vertexShader = 'varying vec3 vIllustratedGeometryNormal;\n' + shader.vertexShader;
      // MeshBasic normally omits normals unless skinning or an environment map
      // needs them. Enable its existing sequence unconditionally, including
      // morph normals, skin normals, instance inverse-scale compensation and
      // normalMatrix. Reimplementing only normalMatrix * normal would break
      // rotated/nonuniform instances and skinned proxies.
      shader.vertexShader = shader.vertexShader
        .replace('#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )', '#if 1')
        .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
          vIllustratedGeometryNormal = normalize(transformedNormal);
        `);
      shader.fragmentShader = /* glsl */`
        uniform vec4 soraIllustratedIds;
        uniform vec4 soraIllustratedInk;
        uniform float soraIllustratedInlineMask;
        varying vec3 vIllustratedGeometryNormal;
        layout(location = 1) out highp vec4 soraIllustratedInkOutput;
        layout(location = 2) out highp vec4 soraIllustratedNormalOutput;
      ` + shader.fragmentShader;
      // Keep the stock alpha-test / skin / morph / instance support. The final
      // output is exact IDs, never passed through color management or lighting.
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        gl_FragColor = soraIllustratedIds;
        soraIllustratedInkOutput = soraIllustratedInk;
        vec3 geometryNormal = normalize(vIllustratedGeometryNormal);
        #ifdef DOUBLE_SIDED
          geometryNormal *= gl_FrontFacing ? 1. : -1.;
        #endif
        soraIllustratedNormalOutput = vec4(geometryNormal * .5 + .5, soraIllustratedInlineMask);
      `).replace('#include <tonemapping_fragment>', '')
        .replace('#include <colorspace_fragment>', '')
        .replace('#include <fog_fragment>', '')
        .replace('#include <premultiplied_alpha_fragment>', '')
        .replace('#include <dithering_fragment>', '');
    };
    material.customProgramCacheKey = () => 'sora-illustrated-geometry-ids-normals-v2';
    return { source, material, ids, ink, inlineMask };
  }

  function updateMaterial(entry: MaterialEntry, objectId: number, sourceMesh: THREE.Mesh) {
    const { source, material, ids, ink, inlineMask } = entry;
    const style = styles.get(source) ?? {};
    const key = style.materialKey ?? (source.name || source.color?.getHexString() || source.type);
    let materialId = materialIds.get(key);
    if (materialId === undefined) {
      materialId = materialIds.size + 1;
      if (materialId > 65535) throw new Error('Illustrated linework material ID capacity exceeded');
      materialIds.set(key, materialId);
    }
    ids.value.set(objectId & 255, objectId >> 8, materialId & 255, materialId >> 8).multiplyScalar(1 / 255);
    const inkColor = style.color !== undefined ? new THREE.Color(style.color) :
      new THREE.Color('#171a29').lerp(source.color ?? new THREE.Color('#66574e'), .065);
    inkColor.convertLinearToSRGB();
    const emissivePower = source.emissive ? Math.max(source.emissive.r, source.emissive.g, source.emissive.b) * (source.emissiveIntensity ?? 1) : 0;
    // A textured emitter remains self-lit when dimmed. Dense transparent lamp
    // covers also occlude ink from their internal reflectors; omitting their
    // proxy would expose those subdivisions through the luminous beauty.
    const mappedEmission = emissivePower > 0 && !!source.emissiveMap;
    const selfLit = mappedEmission || emissivePower > .5;
    const emissiveCover = mappedEmission && source.transparent && source.opacity >= .5;
    const semanticStrength = style.enabled === true ? 1 : selfLit ? 0 : paintedBackgroundInk(sourceMesh, source);
    ink.value.set(inkColor.r, inkColor.g, inkColor.b,
      style.enabled === false ? 0 : THREE.MathUtils.clamp(style.strength ?? .72, 0, 1) * semanticStrength);
    // Atmospheric terrain and fine foliage keep their own painted highlights.
    inlineMask.value = style.enabled !== false && !selfLit && paintedBackgroundInk(sourceMesh, source) > .5 &&
      !!sourceMesh.geometry.getAttribute('normal') ? 1 : 0;
    // Preserve source opacity/map/alpha-map cutouts in the auxiliary coverage.
    // Only majority-covered texels block underlying ink; faint glass keeps
    // the ordinary transparent-surface exclusion below.
    const alphaTest = emissiveCover ? Math.max(.5, source.alphaTest) : source.alphaTest;
    const map = alphaTest > 0 ? source.map ?? null : null;
    const alphaMap = source.alphaMap ?? null;
    if (material.map !== map || material.alphaMap !== alphaMap || material.side !== source.side ||
      (material.alphaTest > 0) !== (alphaTest > 0) || material.alphaHash !== source.alphaHash) {
      material.needsUpdate = true;
    }
    material.map = map; material.alphaMap = alphaMap; material.alphaTest = alphaTest;
    material.opacity = emissiveCover ? source.opacity : 1;
    material.alphaHash = source.alphaHash; material.side = source.side;
    material.clippingPlanes = source.clippingPlanes;
    material.clipIntersection = source.clipIntersection;
    material.polygonOffset = source.polygonOffset;
    material.polygonOffsetFactor = source.polygonOffsetFactor;
    material.polygonOffsetUnits = source.polygonOffsetUnits;
    // Blended glass/decals are excluded, except zero-ink emissive coverage.
    // Masked foliage keeps its source alpha; beauty materials stay untouched.
    material.visible = source.visible && (emissiveCover || (!source.transparent && source.opacity >= .999 &&
      !(source.transmission && source.transmission > 0) && source.depthWrite));
  }

  function proxyFor(source: THREE.Mesh) {
    let entry = proxies.get(source);
    const materials = Array.isArray(source.material) ? source.material : [source.material];
    if (!entry) {
      let proxy: THREE.Mesh;
      if (source instanceof THREE.InstancedMesh) {
        proxy = new THREE.InstancedMesh(source.geometry, [], 0);
      } else if (source instanceof THREE.SkinnedMesh) {
        const skinned = new THREE.SkinnedMesh(source.geometry, []);
        skinned.skeleton = source.skeleton;
        skinned.bindMode = source.bindMode;
        skinned.bindMatrix.copy(source.bindMatrix);
        skinned.bindMatrixInverse.copy(source.bindMatrixInverse);
        proxy = skinned;
      } else {
        proxy = new THREE.Mesh(source.geometry, []);
      }
      proxy.matrixAutoUpdate = proxy.matrixWorldAutoUpdate = false;
      // Original geometries are immutable/shared; avoid copying their bounds.
      proxy.frustumCulled = false;
      entry = { source, proxy, materials: [] };
      proxyScene.add(proxy); proxies.set(source, entry);
    }
    if (entry.materials.length !== materials.length ||
      entry.materials.some((value, i) => value.source !== materials[i])) {
      for (const value of entry.materials) value.material.dispose();
      entry.materials = materials.map(makeMaterial);
      entry.proxy.material = Array.isArray(source.material) ? entry.materials.map(value => value.material) : entry.materials[0].material;
    }
    const proxy = entry.proxy;
    proxy.geometry = source.geometry;
    proxy.matrix.copy(source.matrixWorld); proxy.matrixWorld.copy(source.matrixWorld);
    proxy.layers.mask = source.layers.mask; proxy.renderOrder = source.renderOrder;
    proxy.morphTargetInfluences = source.morphTargetInfluences;
    proxy.morphTargetDictionary = source.morphTargetDictionary;
    if (source instanceof THREE.InstancedMesh && proxy instanceof THREE.InstancedMesh) {
      proxy.instanceMatrix = source.instanceMatrix;
      proxy.count = source.count;
      proxy.morphTexture = source.morphTexture;
    }
    if (source instanceof THREE.SkinnedMesh && proxy instanceof THREE.SkinnedMesh) {
      proxy.skeleton = source.skeleton; proxy.bindMode = source.bindMode;
      proxy.bindMatrix.copy(source.bindMatrix); proxy.bindMatrixInverse.copy(source.bindMatrixInverse);
    }
    return entry;
  }

  return {
    texture: target.textures[0], inkTexture: target.textures[1], normalTexture: target.textures[2], depthTexture: depth, uniforms,
    stats() { return { lineStrength: uniforms.illustratedLineStrength.value,
      creaseStrength: uniforms.illustratedCreaseStrength.value, inlineStrength: uniforms.illustratedInlineStrength.value,
      contrastSuppression: uniforms.illustratedContrastSuppression.value, pixelSize: uniforms.illustratedPixelSize.value }; },
    setObjectRoot(root: THREE.Object3D) { objectRoots.add(root); },
    setMaterialStyle(material: THREE.Material, style: IllustratedInkStyle) { styles.set(material, { ...style }); },
    setStrength(value: number) { uniforms.illustratedLineStrength.value = THREE.MathUtils.clamp(value, 0, 1); },
    setPixelSize(value: number) { uniforms.illustratedPixelSize.value = THREE.MathUtils.clamp(Math.round(value), 1, 4); },
    /** Independent diagnostic; disabled until the material study is reviewed. */
    setInlineStrength(value: number) { uniforms.illustratedInlineStrength.value = THREE.MathUtils.clamp(value, 0, 1); },
    setCreaseStrength(value: number) { uniforms.illustratedCreaseStrength.value = THREE.MathUtils.clamp(value, 0, 1); },
    setContrastSuppression(value: number) { uniforms.illustratedContrastSuppression.value = THREE.MathUtils.clamp(value, 0, 1); },
    setInlineKeyDirection(direction: THREE.Vector3) {
      if (Number.isFinite(direction.lengthSq()) && direction.lengthSq() > 1e-8)
        inlineKeyWorld.copy(direction).normalize();
    },
    /** Optional resolved opaque beauty depth, with matching dimensions/camera. */
    setBeautyDepth(texture: THREE.DepthTexture | null) {
      uniforms.illustratedBeautyDepth.value = texture ?? depth;
      uniforms.illustratedBeautyDepthEnabled.value = texture ? 1 : 0;
    },
    setSize(w: number, h: number) {
      if (disposed || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
      width = Math.max(1, Math.floor(w)); height = Math.max(1, Math.floor(h));
      target.setSize(width, height); uniforms.illustratedResolution.value.set(width, height);
    },
    render(scene: THREE.Scene, camera: THREE.Camera) {
      if (disposed) return;
      const projection = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
      uniforms.illustratedNear.value = projection.near;
      uniforms.illustratedFar.value = projection.far;
      uniforms.illustratedPerspective.value = camera.projectionMatrix.elements[11] === -1 ? 1 : 0;
      uniforms.illustratedProjectionInverse.value.copy(camera.projectionMatrixInverse);
      uniforms.illustratedInlineKeyView.value.copy(inlineKeyWorld).transformDirection(camera.matrixWorldInverse);
      // Call after the beauty render/updateMatrixWorld so no source matrix or
      // callback is changed by this auxiliary pass.
      for (const entry of proxies.values()) entry.proxy.visible = false;
      scene.traverseVisible(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const entry = proxyFor(object), objectId = idForObject(object, scene);
        entry.proxy.visible = true;
        for (const material of entry.materials) updateMaterial(material, objectId, object);
      });
      const savedTarget = renderer.getRenderTarget(), savedFace = renderer.getActiveCubeFace();
      const savedMip = renderer.getActiveMipmapLevel(), savedAutoClear = renderer.autoClear;
      const savedClearAlpha = renderer.getClearAlpha(), savedScissorTest = renderer.getScissorTest();
      const savedXr = renderer.xr.enabled, savedToneMapping = renderer.toneMapping;
      const savedColorSpace = renderer.outputColorSpace, savedShadowAutoUpdate = renderer.shadowMap.autoUpdate;
      renderer.getClearColor(clearColor); renderer.getViewport(viewport); renderer.getScissor(scissor);
      try {
        renderer.xr.enabled = false; renderer.autoClear = false;
        renderer.shadowMap.autoUpdate = false;
        renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        renderer.setRenderTarget(target); renderer.setViewport(0, 0, width, height);
        renderer.setScissorTest(false); renderer.setClearColor(0x000000, 0);
        renderer.clear(true, true, false); renderer.render(proxyScene, camera);
      } finally {
        renderer.setRenderTarget(savedTarget, savedFace, savedMip);
        renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(savedScissorTest);
        renderer.setClearColor(clearColor, savedClearAlpha); renderer.autoClear = savedAutoClear;
        renderer.xr.enabled = savedXr; renderer.toneMapping = savedToneMapping;
        renderer.outputColorSpace = savedColorSpace; renderer.shadowMap.autoUpdate = savedShadowAutoUpdate;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of proxies.values()) for (const material of entry.materials) material.material.dispose();
      proxyScene.clear(); proxies.clear(); materialIds.clear(); target.dispose();
    },
  };
}
