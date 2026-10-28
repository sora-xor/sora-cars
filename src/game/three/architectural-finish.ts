import * as THREE from 'three';

export interface ArchitecturalWearEdge {
  /** An actual exposed trim/paint edge, in the merged building's source metres. */
  readonly start: readonly [number, number, number];
  readonly end: readonly [number, number, number];
  /** Width of the chipped band, in metres. Defaults to 0.025. */
  readonly width?: number;
  /** Optional runoff below a horizontal edge. Zero disables it. */
  readonly runoffLength?: number;
}

export interface ArchitecturalFinishOptions {
  readonly surface?: 'plaster' | 'timber' | 'metal';
  readonly strength?: number;
  /** Source height of the building's ground contact, not world elevation. */
  readonly baseHeight?: number;
  /** Approximate height of irregular rain splash/grime. Defaults to 0.65 m. */
  readonly splashHeight?: number;
  /** At most eight real edges; omit for shared palettes spanning different buildings. */
  readonly edges?: readonly ArchitecturalWearEdge[];
}

export interface ArchitecturalFinish {
  setStrength(value: number): void;
  setEnabled(enabled: boolean): void;
}

const decorated = new WeakMap<THREE.MeshStandardMaterial, ArchitecturalFinish>();
const finite = (value: number, name: string): number => {
  if (!Number.isFinite(value)) throw new Error(`Architectural finish ${name} must be finite`);
  return value;
};
const positive = (value: number, name: string): number => {
  if (finite(value, name) <= 0) throw new Error(`Architectural finish ${name} must be positive`);
  return value;
};
const unit = (value: number): number => Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;

const declarations = /* glsl */ `
  varying vec3 soraArchSourcePosition;
  varying vec3 soraArchSourceNormal;
  uniform float soraArchStrength;
  uniform float soraArchEnabled;
  uniform float soraArchBase;
  uniform float soraArchSplash;
  // Base stain, runoff, roughness increase and pigment desaturation.
  uniform vec4 soraArchResponse;
  uniform vec3 soraArchSoilTint;
  uniform vec3 soraArchSubstrate;
  uniform float soraArchOxidation;
  #if SORA_ARCH_EDGE_COUNT > 0
    uniform vec4 soraArchEdgeStart[SORA_ARCH_EDGE_COUNT];
    uniform vec4 soraArchEdgeEnd[SORA_ARCH_EDGE_COUNT];
  #endif

  float soraArchHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float soraArchNoise(vec3 p) {
    vec3 cell = floor(p), f = fract(p);
    vec3 s = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(soraArchHash(cell), soraArchHash(cell + vec3(1, 0, 0)), s.x),
      mix(soraArchHash(cell + vec3(0, 1, 0)), soraArchHash(cell + vec3(1, 1, 0)), s.x), s.y),
      mix(mix(soraArchHash(cell + vec3(0, 0, 1)), soraArchHash(cell + vec3(1, 0, 1)), s.x),
      mix(soraArchHash(cell + vec3(0, 1, 1)), soraArchHash(cell + vec3(1, 1, 1)), s.x), s.y), s.z);
  }
`;

const finish = /* glsl */ `
  #include <roughnessmap_fragment>
  vec3 soraArchP = soraArchSourcePosition;
  vec3 soraArchN = normalize(soraArchSourceNormal);
  float soraArchAmount = soraArchStrength * soraArchEnabled;
  // Original surface orientation excludes ceilings. Normal maps remain free to
  // produce the photographed fine relief in Three's physical lighting stage.
  float soraArchWall = 1.0 - smoothstep(0.35, 0.85, abs(soraArchN.y));
  float soraArchUp = smoothstep(0.45, 0.95, soraArchN.y);
  float soraArchCoverage = soraArchNoise(soraArchP * vec3(0.61, 0.32, 0.61) + vec3(7.3, 2.1, -4.7));
  float soraArchBreakup = soraArchNoise(soraArchP * vec3(3.2, 1.7, 3.2) + vec3(-1.4, 9.2, 6.1));
  // A broken ground-contact band has a varying height, never a straight dirty
  // stripe repeated at invented floor intervals.
  float soraArchHeight = soraArchP.y - soraArchBase;
  float soraArchSplashTop = soraArchSplash * (0.48 + 0.65 * soraArchCoverage);
  float soraArchBaseGrime = (1.0 - smoothstep(0.02, soraArchSplashTop, soraArchHeight))
    * (0.48 + 0.52 * soraArchBreakup) * soraArchWall;
  // Sparse, metre-long vertical channels follow gravity on exposed walls.
  // Their width wanders slowly; no screen/UV/triangle coordinates are involved.
  float soraArchChannel = soraArchNoise(soraArchP * vec3(7.5, 0.42, 7.5)
    + vec3(soraArchCoverage * 1.1, 3.7, -soraArchCoverage * 0.9));
  float soraArchRunoff = smoothstep(0.59, 0.79, soraArchChannel)
    * smoothstep(0.36, 0.70, soraArchCoverage) * soraArchWall
    * smoothstep(0.12, soraArchSplash + 0.25, soraArchHeight);
  float soraArchChip = 0.0;
  #if SORA_ARCH_EDGE_COUNT > 0
    float soraArchFlake = soraArchNoise(soraArchP * 47.0 + vec3(13.1, -5.7, 2.9));
    for (int i = 0; i < SORA_ARCH_EDGE_COUNT; i++) {
      vec3 a = soraArchEdgeStart[i].xyz, b = soraArchEdgeEnd[i].xyz;
      vec3 line = b - a;
      float along = clamp(dot(soraArchP - a, line) / dot(line, line), 0.0, 1.0);
      float distanceToEdge = length(soraArchP - mix(a, b, along));
      float width = soraArchEdgeStart[i].w;
      float edgeMask = 1.0 - smoothstep(width * 0.25, width, distanceToEdge);
      soraArchChip = max(soraArchChip, edgeMask * smoothstep(0.52, 0.77,
        soraArchFlake * 0.72 + soraArchBreakup * 0.28));
      // Authored horizontal edges can seed runoff on the surface directly
      // below them. Vertical trim still chips, but does not invent a rain ledge.
      vec2 horizontal = line.xz;
      float horizontalLength2 = dot(horizontal, horizontal);
      if (soraArchEdgeEnd[i].w > 0.0 && abs(line.y) < 0.01 && horizontalLength2 > 0.0001) {
        float u = clamp(dot(soraArchP.xz - a.xz, horizontal) / horizontalLength2, 0.0, 1.0);
        float planeDistance = length(soraArchP.xz - mix(a.xz, b.xz, u));
        float below = a.y - soraArchP.y;
        float length = soraArchEdgeEnd[i].w * (0.45 + 0.55 * soraArchBreakup);
        float rain = (1.0 - smoothstep(width, width + 0.06, planeDistance))
          * smoothstep(0.0, 0.035, below) * (1.0 - smoothstep(0.04, length, below))
          * smoothstep(0.45, 0.75, soraArchChannel) * soraArchWall;
        soraArchRunoff = max(soraArchRunoff, rain);
      }
    }
  #endif
  float soraArchDeposits = clamp(soraArchBaseGrime * soraArchResponse.x
    + soraArchRunoff * soraArchResponse.y, 0.0, 0.65) * soraArchAmount;
  // Pigment/soil response only: actual illumination, emission and occlusion
  // continue through the existing material hooks and PBR shader unchanged.
  diffuseColor.rgb *= mix(vec3(1.0), soraArchSoilTint, soraArchDeposits);
  float soraArchLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float soraArchFade = (soraArchRunoff * 0.5 + soraArchUp * soraArchCoverage * 0.35)
    * soraArchResponse.w * soraArchAmount;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(soraArchLuma), soraArchFade);
  diffuseColor.rgb = mix(diffuseColor.rgb, soraArchSubstrate, soraArchChip * soraArchAmount * 0.48);
  float soraArchWear = clamp(soraArchDeposits + soraArchChip * soraArchAmount * 0.48, 0.0, 1.0);
  roughnessFactor = mix(roughnessFactor, min(1.0, roughnessFactor + soraArchResponse.z), soraArchWear);
`;

/** Decorate merged architecture whose positions/normals are already authored in
 * building-local metres. Apply to the source palette before ArchitectureAmbient
 * clones it: that wrapper preserves this hook and its live controller uniforms.
 * City instances then reuse the same local weathering without per-instance data.
 * First-call options persist; repeated calls return the existing controller.
 */
export function decorateArchitecturalFinish(material: THREE.MeshStandardMaterial,
  options: ArchitecturalFinishOptions = {}): ArchitecturalFinish {
  const existing = decorated.get(material); if (existing) return existing;
  const surface = options.surface ?? 'plaster';
  const profile = {
    plaster: { response: [.40, .20, .15, .10], soil: '#908775', substrate: '#a29b88', oxidation: 0 },
    timber: { response: [.49, .24, .20, .32], soil: '#827c6b', substrate: '#817059', oxidation: 0 },
    metal: { response: [.25, .16, .25, .06], soil: '#988679', substrate: '#756c60', oxidation: .8 },
  }[surface];
  if (!profile) throw new Error('Unsupported architectural finish surface');
  const base = finite(options.baseHeight ?? 0, 'baseHeight');
  const splash = positive(options.splashHeight ?? .65, 'splashHeight');
  const edges = options.edges ?? [];
  if (edges.length > 8) throw new Error('Architectural finish supports at most eight authored edges');
  const starts: THREE.Vector4[] = [], ends: THREE.Vector4[] = [];
  for (const edge of edges) {
    if (edge.start.length !== 3 || edge.end.length !== 3) throw new Error('Architectural finish edge endpoints require three coordinates');
    edge.start.forEach(v => finite(v, 'edge start')); edge.end.forEach(v => finite(v, 'edge end'));
    if (new THREE.Vector3(...edge.start).distanceToSquared(new THREE.Vector3(...edge.end)) < 1e-8) {
      throw new Error('Architectural finish edges must have nonzero length');
    }
    const width = positive(edge.width ?? .025, 'edge width');
    const runoff = finite(edge.runoffLength ?? 0, 'runoffLength');
    if (runoff < 0) throw new Error('Architectural finish runoffLength cannot be negative');
    starts.push(new THREE.Vector4(...edge.start, width)); ends.push(new THREE.Vector4(...edge.end, runoff));
  }
  const strength = { value: unit(options.strength ?? 1) }, enabled = { value: 1 };
  const uniforms = { soraArchStrength: strength, soraArchEnabled: enabled,
    soraArchBase: { value: base }, soraArchSplash: { value: splash },
    soraArchResponse: { value: new THREE.Vector4(...profile.response as [number, number, number, number]) },
    soraArchSoilTint: { value: new THREE.Color(profile.soil) }, soraArchSubstrate: { value: new THREE.Color(profile.substrate) },
    soraArchOxidation: { value: profile.oxidation }, soraArchEdgeStart: { value: starts }, soraArchEdgeEnd: { value: ends } };
  const previousCompile = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
  const baseKey = previousKey === THREE.Material.prototype.customProgramCacheKey
    ? () => previousCompile.toString() : () => previousKey.call(material);
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    if (!shader.vertexShader.includes('#include <begin_vertex>')
      || !shader.fragmentShader.includes('#include <roughnessmap_fragment>')
      || !shader.fragmentShader.includes('#include <metalnessmap_fragment>')) {
      throw new Error('Unsupported architectural material shader layout');
    }
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 soraArchSourcePosition; varying vec3 soraArchSourceNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
      #include <begin_vertex>
      soraArchSourcePosition = position;
      soraArchSourceNormal = normal;
    `);
    shader.fragmentShader = `#define SORA_ARCH_EDGE_COUNT ${edges.length}\n${declarations}\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', finish);
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', /* glsl */ `
      #include <metalnessmap_fragment>
      metalnessFactor *= 1.0 - soraArchWear * soraArchOxidation;
    `);
  };
  material.customProgramCacheKey = () => `${baseKey()}:sora-architectural-finish-v1:edges-${edges.length}`;
  material.needsUpdate = true;
  const controller: ArchitecturalFinish = {
    setStrength(value) { strength.value = unit(value); },
    setEnabled(value) { enabled.value = value ? 1 : 0; },
  };
  decorated.set(material, controller);
  return controller;
}
