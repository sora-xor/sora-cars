import * as THREE from 'three';
import { ART_SHORT_SIDE } from '../pixel-art/grid';
import { hashInts, seeded } from './layout';
import { cityGroundLights } from './materials';
import type { PeriodDistant } from './skyline';

/**
 * A route's land out to the horizon, for the views over a basin from a hill climb (Nara from Wakakusa-yama).
 * The period city and the slope terrain end within about 130 m of the road, and past them the camera saw the
 * sky's own lower half, which read as a calm sea. This draws the real ground there from an elevation grid
 * (scripts/build-far-land.ts), with the plan's 1986 towns, main roads and farm villages lit as the city's
 * street lights come on.
 *
 * Every vertex keeps its direction from the camera but is pulled onto a thin shell just inside the far
 * plane, its depth there still ordered by true distance. Everything the route builds stands nearer, so it
 * wins the depth test; the sky stays behind; and the land's own nearer hills still hide what lies beyond
 * them. Its colour fades with true distance toward the haze of the far ridges, which skip the city's fog too.
 */
export interface FarLandGrid {
  readonly south: number; readonly north: number; readonly west: number; readonly east: number;
  readonly rows: number; readonly cols: number;
  /** Metres, row-major from the south-west corner, as little-endian int16 in base64. */
  readonly heights: string;
}
/** An ellipse on the map: its centre, half-axes in metres (east-west, north-south), and how densely it is lit (0–1). */
export interface FarLandArea { readonly lat: number; readonly lon: number; readonly rx: number; readonly rz: number; readonly lit?: number }
export interface FarLandPlan {
  /** The route's origin: render X runs west of it, Z north, in metres. */
  readonly origin: { readonly lat: number; readonly lon: number };
  readonly grid: FarLandGrid;
  /** The basin floor's highest ground (m): farms and villages below it, wooded hills above. */
  readonly floor: number;
  /** Built-up areas, lit at night. */
  readonly towns: readonly FarLandArea[];
  /** Main roads as (lat, lon) polylines, lit by lamps and traffic. */
  readonly roads: readonly (readonly (readonly [number, number])[])[];
  /** Dark open ground: parks and palace sites. */
  readonly parks: readonly FarLandArea[];
  /** Open grass hills, such as Wakakusa-yama's lawns. */
  readonly grass: readonly FarLandArea[];
  /** Share of the wooded hills in late-autumn colour (crimson, orange and gold among the dark conifers), 0–1; the
   * route cutscenes paint every hillside so (iroha-wide, nara-wide, aizu-right). Absent: evergreen. */
  readonly autumn?: number;
  /** Compass bearing (degrees) of the light that shades the slopes: the route's low sun. Absent: 90, the original
   * shading, which brightens east-facing slopes. */
  readonly light?: number;
  /** The daylight haze the far ridges fade into: its colour away from and toward `light`, and the metres over which it
   * takes 63% of a ridge, so ranges at different distances step apart as in the repaints' layered mountains. Absent:
   * one lavender-grey haze all round over 9000 m. */
  readonly haze?: { readonly away: string; readonly toward: string; readonly metres: number };
  /** Draw the near wooded slopes crown by crown (a mountain road's own mountainside). Absent: plain colour. */
  readonly canopy?: boolean;
  /** How much brighter the near land stands in full afternoon light than at dusk (1 the default): an unlit far land
   * tuned for dusk basins reads nearly black against a sunlit scene. The gain fades out between 1.2 and 3.5 km, so the
   * far ridges keep their depth in the haze: lifted alike, they washed out pale pink where the Irohazaka repaints paint
   * blue-violet mountains (laps .3 and .45). */
  readonly dayGain?: number;
}

/** The land as an entry in a scene's far silhouettes; the skyline builds it instead of a far object. */
export const farLand = (plan: FarLandPlan): PeriodDistant => ({ x: 0, z: 0, build: () => {}, land: plan });

/** The shell: its inner radius and depth (metres), inside the camera's 600 m far plane and behind the skyline's 520 m. */
const SHELL = 560, DEPTH = 36;
/** Metres per degree of latitude in the track compiler's projection, so the land meets the road where it should. */
export const FAR_LAND_METRES_PER_DEGREE = 6371008.8 * Math.PI / 180;
const NORTH_METRES = FAR_LAND_METRES_PER_DEGREE;

export function farLandHeights(grid: FarLandGrid): Int16Array {
  const bytes = Uint8Array.from(atob(grid.heights), c => c.charCodeAt(0));
  if (bytes.length !== grid.rows * grid.cols * 2) throw new RangeError('Far-land grid size mismatch.');
  return new Int16Array(bytes.buffer);
}

/** Land shading, then haze. Positions move onto the shell; true distance drives haze and depth order. */
const SHELL_VERTEX = /* glsl */ `
  uniform float farShell;
  uniform float farDepth;
  float farTrue;
  vec4 farPlace(vec3 local, float lift) {
    vec4 world = modelMatrix * vec4(local, 1.);
    vec3 d = world.xyz - cameraPosition;
    farTrue = max(length(d), 1.);
    world.xyz = cameraPosition + d * ((farShell + farDepth * farTrue / (farTrue + 4000.) - lift) / farTrue);
    return projectionMatrix * viewMatrix * world;
  }`;

function landMaterial(uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'Period far land', uniforms, fog: false, toneMapped: false,
    vertexShader: /* glsl */ `
      attribute vec3 landColour;
      attribute float landWood;
      uniform vec3 farSun;
      uniform float farHaze;
      varying vec3 vColour;
      varying float vHaze;
      varying float vSunward;
      varying float vWood;
      varying vec3 vWorld;
      varying float vFar;
      uniform vec2 farGainReach;
      ${SHELL_VERTEX}
      void main() {
        gl_Position = farPlace(position, 0.);
        vColour = landColour;
        vHaze = 1. - exp(-farTrue / farHaze);
        vFar = smoothstep(farGainReach.x, farGainReach.y, farTrue);
        vWorld = (modelMatrix * vec4(position, 1.)).xyz;
        // Ridges toward a route's low sun fade into its warm glow, as in the painted sky (z 0: no sun given).
        vec3 d = vWorld - cameraPosition;
        vSunward = farSun.z * smoothstep(-.25, 1., dot(normalize(d.xz + vec2(1e-5, 0.)), farSun.xy));
        // Within about 3 km a wooded slope shows its crowns, each two art cells or more across.
        vWood = landWood * (1. - smoothstep(1500., 3500., farTrue));
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 landTint;
      uniform vec3 hazeColour;
      uniform vec3 hazeSunward;
      uniform vec3 farSun;
      uniform vec3 farCanopy;
      uniform float farDayGain;
      varying float vFar;
      varying vec3 vColour;
      varying float vHaze;
      varying float vSunward;
      varying float vWood;
      varying vec3 vWorld;
      float farHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      vec3 farHash3(vec3 p) { return fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))) * 43758.5453); }
      float farNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
        return mix(mix(farHash(vec3(i, 0.)), farHash(vec3(i + vec2(1., 0.), 0.)), u.x), mix(farHash(vec3(i + vec2(0., 1.), 0.)), farHash(vec3(i + vec2(1., 1.), 0.)), u.x), u.y);
      }
      // The forest canopy on a near slope, crown by crown, anchored in the world. Stands about 90 m across are either
      // broadleaf (crimson, orange and gold in farCanopy.y of them, a few still green) or dark conifer. Broadleaf crowns are
      // rounded, conifers narrow spires (their cells stretched upright); every crown takes its own size, so they overlap in
      // places and leave shaded gaps in others, and clumps of leaves light and shade its inside. A lattice of equal crowns
      // with even seams read as cobblestones.
      vec3 canopy(vec3 base) {
        float stand = farNoise(vWorld.xz / 90.) * .75 + farNoise(vWorld.xz / 31. + 7.) * .25;
        bool conifer = stand > farCanopy.y;
        vec3 scale = conifer ? vec3(4.2, 9., 4.2) : vec3(farCanopy.x, farCanopy.x * .8, farCanopy.x);
        vec3 q = vWorld / scale, cell = floor(q);
        float best = 9.; vec3 nearest = vec3(0.), seed = vec3(0.); float radius = .5;
        for (int i = 0; i < 27; i++) {
          vec3 c = cell + vec3(float(i % 3 - 1), float(i / 3 % 3 - 1), float(i / 9 - 1)), feature = c + farHash3(c) * .9 + .05;
          // Each crown its own size: the distance is measured against its radius, so big crowns win over small ones.
          float r = .38 + .34 * farHash(c + 9.1), d = length(q - feature) / r;
          if (d < best) { best = d; nearest = feature; seed = c; radius = r; }
        }
        // Broadleaf crowns take their colour by the grove: a colour field about 70 m across, with a little play from crown to
        // crown, so a slope reads as groves of crimson, orange and gold. One random tone per crown read as polka dots.
        vec2 at = nearest.xz * scale.xz;
        float grove = farNoise(at / 70. + 13.) * .7 + farNoise(at / 23. - 5.) * .3 + (farHash(seed + 41.7) - .5) * .16;
        vec3 tone = conifer ? vec3(.06, .12, .07)
          : grove < .44 ? vec3(.64, .12, .04) : grove < .58 ? vec3(.82, .3, .06) : grove < .68 ? vec3(.8, .54, .12) : vec3(.14, .24, .08);
        float value = dot(base, vec3(.2126, .7152, .0722)), own = dot(tone, vec3(.2126, .7152, .0722));
        vec2 sun = farSun.z > 0. ? farSun.xy : vec2(-1., 0.);
        vec3 o = (q - nearest) * vec3(1., conifer ? .5 : 1., 1.);
        vec3 normal = normalize(o + vec3(0., .45, 0.)), light = normalize(vec3(sun.x, .7, sun.y));
        float lit = clamp(dot(normal, light) * .55 + .5, 0., 1.);
        // Clumps of leaves inside the crown: a finer world-anchored noise brightens some and shades others.
        float clump = farNoise(vWorld.xz / (conifer ? 1.6 : 2.4) + vWorld.y * .3) * .6 + farNoise(vWorld.xz / .9 - vWorld.y * .5) * .4;
        vec3 leaves = tone * (value / own) * (.62 + 1. * lit) * (.75 + .5 * clump) * (.88 + .24 * farHash(seed + 3.1));
        // Inside the crown (best < 1) its leaves; outside, the shaded understory, darker the farther from any crown.
        float inside = 1. - smoothstep(.82, 1.08, best + (clump - .5) * .25);
        vec3 shade = mix(base * .7, tone * (value / own) * .45, .4);
        return mix(shade, leaves, inside);
      }
      void main() {
        vec3 ground = vWood > .01 ? mix(vColour, canopy(vColour), vWood * farCanopy.z) : vColour;
        gl_FragColor = vec4(mix(ground * landTint * mix(farDayGain, 1., vFar), mix(hazeColour, hazeSunward, vSunward), vHaze), 1.);
      }`,
  });
}

function lightMaterial(uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'Period far land lights', uniforms, fog: false, toneMapped: false,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 lightColour;
      attribute float lightSize;
      uniform vec2 farPixels;
      varying vec3 vColour;
      ${SHELL_VERTEX}
      void main() {
        // Lifted a little toward the camera on the shell, so a light's own ground never hides it.
        gl_Position = farPlace(position, .35);
        gl_PointSize = max(lightSize / farTrue * farPixels.x, farPixels.y);
        vColour = lightColour * exp(-farTrue / 16000.);
      }`,
    fragmentShader: /* glsl */ `
      uniform float farNight;
      varying vec3 vColour;
      void main() {
        vec2 d = gl_PointCoord - .5;
        if (dot(d, d) > .25) discard;
        gl_FragColor = vec4(vColour * farNight, 1.);
      }`,
  });
}

/** Lamp kinds of the 1980s: fluorescent homes and offices, mercury and sodium street lamps, incandescent shops. */
const GLOWS = { fluorescent: new THREE.Color('#e4ecff'), mercury: new THREE.Color('#c4d8ff'), sodium: new THREE.Color('#ffae58'), warm: new THREE.Color('#ffd6a0') };

export class FarLand {
  readonly group = new THREE.Group();
  private readonly uniforms = {
    farShell: { value: SHELL }, farDepth: { value: DEPTH }, farPixels: { value: new THREE.Vector2(800, 3) }, farNight: cityGroundLights,
    landTint: { value: new THREE.Color() }, hazeColour: { value: new THREE.Color() },
    hazeSunward: { value: new THREE.Color() }, farSun: { value: new THREE.Vector3() }, farHaze: { value: 9000 },
    // x crown spacing (m), y the share of crowns in autumn colour (the plan's `autumn`), z the canopy's strength (0 off).
    farCanopy: { value: new THREE.Vector3(9, 0, 0) },
    // The day gain at this hour, and the distances (m) over which it fades out.
    farDayGain: { value: 1 }, farGainReach: { value: new THREE.Vector2(1200, 3500) },
  };
  private readonly land: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly lights: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly night = { tint: new THREE.Color('#5d5878'), haze: new THREE.Color('#3f3a58') };
  private readonly dusk = { tint: new THREE.Color('#d8c4c0'), haze: new THREE.Color('#8f7f98') };
  /** The plan's own daylight haze, away from and toward its light (`plan.haze`), if any. */
  private readonly dayHaze: { readonly away: THREE.Color; readonly toward: THREE.Color } | null;
  private readonly dayGain: number;

  constructor(plan: FarLandPlan) {
    this.group.name = 'SORA far land';
    const { grid, origin, floor } = plan, heights = farLandHeights(grid), random = seeded(hashInts(grid.rows, grid.cols, 1986));
    // Toward the sun in render XZ (X west, Z north).
    if (plan.light !== undefined) this.uniforms.farSun.value.set(-Math.sin(plan.light * Math.PI / 180), Math.cos(plan.light * Math.PI / 180), 1);
    this.dayHaze = plan.haze ? { away: new THREE.Color(plan.haze.away), toward: new THREE.Color(plan.haze.toward) } : null;
    this.uniforms.farHaze.value = plan.haze?.metres ?? 9000;
    this.uniforms.farCanopy.value.set(9, plan.autumn ?? 0, plan.canopy ? 1 : 0);
    this.dayGain = plan.dayGain ?? 1;
    const east = NORTH_METRES * Math.cos(origin.lat * Math.PI / 180);
    const place = (lat: number, lon: number) => ({ x: -(lon - origin.lon) * east, z: (lat - origin.lat) * NORTH_METRES });
    const heightAt = (lat: number, lon: number) => {
      const r = THREE.MathUtils.clamp((lat - grid.south) / (grid.north - grid.south), 0, 1) * (grid.rows - 1);
      const c = THREE.MathUtils.clamp((lon - grid.west) / (grid.east - grid.west), 0, 1) * (grid.cols - 1);
      const r0 = Math.min(Math.floor(r), grid.rows - 2), c0 = Math.min(Math.floor(c), grid.cols - 2), fr = r - r0, fc = c - c0;
      const v = (i: number, j: number) => heights[i * grid.cols + j]!;
      return (v(r0, c0) * (1 - fc) + v(r0, c0 + 1) * fc) * (1 - fr) + (v(r0 + 1, c0) * (1 - fc) + v(r0 + 1, c0 + 1) * fc) * fr;
    };
    // How far inside an area a point lies: 1 well inside, falling to 0 at its edge.
    const within = (area: FarLandArea, lat: number, lon: number) => {
      const dx = (lon - area.lon) * east / area.rx, dz = (lat - area.lat) * NORTH_METRES / area.rz;
      return 1 - THREE.MathUtils.smoothstep(Math.hypot(dx, dz), .7, 1);
    };
    const most = (areas: readonly FarLandArea[], lat: number, lon: number) => areas.reduce((m, area) => Math.max(m, within(area, lat, lon)), 0);

    // Ground: late-autumn paddies on the floor, wooded hills, grey roofs in the towns, dark parks, golden lawns.
    const fields = new THREE.Color('#6a5f45'), forest = new THREE.Color('#29352f'), roofs = new THREE.Color('#5f5a66');
    const park = new THREE.Color('#2b332d'), lawn = new THREE.Color('#9a8450'), colour = new THREE.Color();
    // Late-autumn broadleaf stands, in patches about a kilometre across among the conifers.
    const turned = [new THREE.Color('#7c2a20'), new THREE.Color('#9c4a22'), new THREE.Color('#9a7428')], autumn = plan.autumn ?? 0;
    const patch = (lat: number, lon: number, scale: number, salt: number) => {
      const x = lon * east / scale, z = lat * NORTH_METRES / scale, ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
      const v = (a: number, b: number) => hashInts(a, b, salt) / 4294967296;
      const u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
      return (v(ix, iz) * (1 - u) + v(ix + 1, iz) * u) * (1 - w) + (v(ix, iz + 1) * (1 - u) + v(ix + 1, iz + 1) * u) * w;
    };
    const positions = new Float32Array(grid.rows * grid.cols * 3), colours = new Float32Array(grid.rows * grid.cols * 3), wood = new Float32Array(grid.rows * grid.cols);
    const dLat = (grid.north - grid.south) / (grid.rows - 1), dLon = (grid.east - grid.west) / (grid.cols - 1);
    const cellX = dLon * east, cellZ = dLat * NORTH_METRES;
    const bearing = (plan.light ?? 90) * Math.PI / 180, lightEast = Math.sin(bearing), lightNorth = Math.cos(bearing);
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
      const i = r * grid.cols + c, lat = grid.south + r * dLat, lon = grid.west + c * dLon, h = heights[i]!, at = place(lat, lon);
      positions.set([at.x, h, at.z], i * 3);
      const hill = THREE.MathUtils.smoothstep(h, floor, floor + 70);
      const town = most(plan.towns, lat, lon), parkland = most(plan.parks, lat, lon), grassland = most(plan.grass, lat, lon);
      colour.copy(forest);
      if (autumn > 0 && patch(lat, lon, 900, 7) < autumn) colour.lerp(turned[Math.floor(patch(lat, lon, 420, 11) * 3) % 3]!, .55 + .45 * random());
      colour.lerp(fields, 1 - hill).lerp(roofs, town * (1 - hill * .6)).lerp(park, parkland).lerp(lawn, grassland);
      wood[i] = hill * (1 - town) * (1 - parkland) * (1 - grassland);
      // The low sun on slopes that face it, and a little grain for the art cells to catch.
      const dEast = (heights[r * grid.cols + Math.min(c + 1, grid.cols - 1)]! - heights[r * grid.cols + Math.max(c - 1, 0)]!) / (2 * cellX);
      const north = (heights[Math.min(r + 1, grid.rows - 1) * grid.cols + c]! - heights[Math.max(r - 1, 0) * grid.cols + c]!) / (2 * cellZ);
      const facing = -(dEast * lightEast + north * lightNorth);
      colour.multiplyScalar(THREE.MathUtils.clamp(1 + facing * 1.6 - north * .4, .6, 1.35) * (.92 + random() * .16));
      colours.set([colour.r, colour.g, colour.b], i * 3);
    }
    const index: number[] = [];
    for (let r = 0; r + 1 < grid.rows; r++) for (let c = 0; c + 1 < grid.cols; c++) {
      // West is +X, so these windings face up.
      const a = r * grid.cols + c, b = a + 1, d = a + grid.cols, e = d + 1;
      index.push(a, b, d, b, e, d);
    }
    const ground = new THREE.BufferGeometry();
    ground.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    ground.setAttribute('landColour', new THREE.BufferAttribute(colours, 3));
    ground.setAttribute('landWood', new THREE.BufferAttribute(wood, 1));
    ground.setIndex(index);
    this.land = new THREE.Mesh(ground, landMaterial(this.uniforms));
    this.land.name = 'Period far land'; this.land.frustumCulled = false;

    // Lights: towns scattered densest at their centres, lamps along the main roads, farm villages in clusters.
    const light: number[] = [];
    const add = (lat: number, lon: number, glow: THREE.Color, strength: number, size: number) => {
      if (most(plan.parks, lat, lon) > .5) return;
      const at = place(lat, lon);
      light.push(at.x, heightAt(lat, lon) + 4, at.z, glow.r * strength, glow.g * strength, glow.b * strength, size);
    };
    const pick = (weights: readonly [THREE.Color, number][]) => { let roll = random(); for (const [glow, w] of weights) if ((roll -= w) < 0) return glow; return weights[0]![0]; };
    for (const town of plan.towns) {
      const count = Math.round(Math.PI * town.rx * town.rz / 4500 * (town.lit ?? 1));
      for (let n = 0; n < count; n++) {
        const radius = Math.sqrt(random()) * (.35 + .65 * random()), turn = random() * Math.PI * 2;
        const lat = town.lat + Math.sin(turn) * radius * town.rz / NORTH_METRES, lon = town.lon + Math.cos(turn) * radius * town.rx / east;
        if (heightAt(lat, lon) > floor + 60) continue;
        add(lat, lon, pick([[GLOWS.fluorescent, .5], [GLOWS.warm, .25], [GLOWS.mercury, .15], [GLOWS.sodium, .1]]), 1.6 + random(), 5);
      }
    }
    for (const road of plan.roads) for (let k = 0; k + 1 < road.length; k++) {
      const [lat0, lon0] = road[k]!, [lat1, lon1] = road[k + 1]!;
      const length = Math.hypot((lat1 - lat0) * NORTH_METRES, (lon1 - lon0) * east), steps = Math.floor(length / 45);
      for (let n = 0; n < steps; n++) {
        const t = (n + random() * .5) / steps, jitter = (random() - .5) * 12 / NORTH_METRES;
        add(lat0 + (lat1 - lat0) * t + jitter, lon0 + (lon1 - lon0) * t + jitter, random() < .55 ? GLOWS.sodium : GLOWS.mercury, 1.8 + random() * .8, 6);
      }
    }
    for (let v = 0; v < 700; v++) {
      const lat = grid.south + random() * (grid.north - grid.south), lon = grid.west + random() * (grid.east - grid.west);
      if (heightAt(lat, lon) > floor || most(plan.towns, lat, lon) > 0) continue;
      for (let n = 3 + Math.floor(random() * 7); n > 0; n--) {
        add(lat + (random() - .5) * 140 / NORTH_METRES, lon + (random() - .5) * 140 / east, random() < .7 ? GLOWS.fluorescent : GLOWS.warm, 1.1 + random() * .6, 4);
      }
    }
    const count = light.length / 7, lit = new THREE.BufferGeometry();
    const at = new Float32Array(count * 3), glow = new Float32Array(count * 3), size = new Float32Array(count);
    for (let n = 0; n < count; n++) { at.set(light.slice(n * 7, n * 7 + 3), n * 3); glow.set(light.slice(n * 7 + 3, n * 7 + 6), n * 3); size[n] = light[n * 7 + 6]!; }
    lit.setAttribute('position', new THREE.BufferAttribute(at, 3));
    lit.setAttribute('lightColour', new THREE.BufferAttribute(glow, 3));
    lit.setAttribute('lightSize', new THREE.BufferAttribute(size, 1));
    this.lights = new THREE.Points(lit, lightMaterial(this.uniforms));
    this.lights.name = 'Period far land lights'; this.lights.frustumCulled = false; this.lights.renderOrder = 1;
    // Point sizes in pixels of the target being drawn: never under two art cells, as the street's far lights.
    const pixels = this.uniforms.farPixels.value, target = new THREE.Vector2();
    this.lights.onBeforeRender = (renderer, _scene, camera) => {
      const current = renderer.getRenderTarget();
      if (current) target.set(current.width, current.height); else renderer.getDrawingBufferSize(target);
      const fov = camera instanceof THREE.PerspectiveCamera ? THREE.MathUtils.degToRad(camera.getEffectiveFOV()) : 1;
      pixels.set(target.y / (2 * Math.tan(fov / 2)), 2 * Math.min(target.x, target.y) / ART_SHORT_SIDE);
    };
    this.group.add(this.land, this.lights);
  }

  /** How many lights the plan made, for tests. */
  get lightCount(): number { return this.lights.geometry.getAttribute('position').count; }

  /** Daylight 0 night .. 1 sunrise, on the skyline's own curve. */
  update(daylight: number): void {
    const t = THREE.MathUtils.smoothstep(daylight, .2, 1);
    this.uniforms.landTint.value.lerpColors(this.night.tint, this.dusk.tint, t);
    this.uniforms.farDayGain.value = THREE.MathUtils.lerp(1, this.dayGain, THREE.MathUtils.smoothstep(daylight, .6, .95));
    this.uniforms.hazeColour.value.lerpColors(this.night.haze, this.dayHaze?.away ?? this.dusk.haze, t);
    this.uniforms.hazeSunward.value.lerpColors(this.night.haze, this.dayHaze?.toward ?? this.dusk.haze, t);
  }

  dispose(): void {
    this.land.geometry.dispose(); this.land.material.dispose();
    this.lights.geometry.dispose(); this.lights.material.dispose();
  }
}
