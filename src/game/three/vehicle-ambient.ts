import * as THREE from 'three';

/** Source-baked visibility of the sky beneath the actual AE86 body and tires.
 * Applied to indirect road lighting, so direct lamps retain their real shadows.
 * World-space projection follows the existing native pavement at every grade.
 */
export class VehicleAmbientOcclusion {
  private readonly cars = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0));
  private readonly headings = Array.from({ length: 8 }, () => new THREE.Vector2(1, 0));
  private readonly texture: THREE.Texture;
  private readonly decorated = new WeakSet<THREE.Material>();

  constructor() {
    this.texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/models/sora-ae86/ambient-visibility.png`);
    this.texture.name = 'AE86 source-derived ambient visibility';
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.anisotropy = 4;
  }

  setCar(index: number, position: THREE.Vector3, heading: number, opacity: number): void {
    const car = this.cars[index], direction = this.headings[index];
    if (!car || !direction) return;
    car.set(position.x, position.y, position.z, THREE.MathUtils.clamp(opacity, 0, 1));
    direction.set(Math.cos(heading), Math.sin(heading));
  }

  decorate(material: THREE.MeshStandardMaterial): void {
    if (this.decorated.has(material)) return;
    this.decorated.add(material);
    const original = material.onBeforeCompile, key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      original.call(material, shader, renderer);
      shader.uniforms.soraVehicleVisibility = { value: this.texture };
      shader.uniforms.soraVehiclePositions = { value: this.cars };
      shader.uniforms.soraVehicleHeadings = { value: this.headings };
      shader.vertexShader = 'varying vec3 soraRoadWorldPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nsoraRoadWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = /* glsl */ `
        varying vec3 soraRoadWorldPosition;
        uniform sampler2D soraVehicleVisibility;
        uniform vec4 soraVehiclePositions[8];
        uniform vec2 soraVehicleHeadings[8];
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', /* glsl */ `
        #include <aomap_fragment>
        float soraVehicleOcclusion = 1.0;
        for (int i = 0; i < 8; i++) {
          vec3 delta = soraRoadWorldPosition - soraVehiclePositions[i].xyz;
          vec2 direction = soraVehicleHeadings[i];
          vec2 local = vec2(direction.x * delta.x - direction.y * delta.z,
                            direction.y * delta.x + direction.x * delta.z);
          vec2 uv = local / vec2(5.0, 7.6) + 0.5;
          if (soraVehiclePositions[i].w > 0.0 && all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)))) {
            // The bake measures nearby blocked sky, not bounce light. Retain
            // a small ambient floor and reject unrelated surfaces at other heights.
            float weight = soraVehiclePositions[i].w * (1.0 - smoothstep(0.45, 1.2, abs(delta.y)));
            float visibility = texture2D(soraVehicleVisibility, uv).r;
            soraVehicleOcclusion *= mix(1.0, visibility, weight * 0.84);
          }
        }
        reflectedLight.indirectDiffuse *= soraVehicleOcclusion;
        #if defined(USE_CLEARCOAT)
          clearcoatSpecularIndirect *= soraVehicleOcclusion;
        #endif
        #if defined(USE_SHEEN)
          sheenSpecularIndirect *= soraVehicleOcclusion;
        #endif
        #if defined(USE_ENVMAP) && defined(STANDARD)
          float soraDotNV = saturate(dot(geometryNormal, geometryViewDir));
          reflectedLight.indirectSpecular *= computeSpecularOcclusion(soraDotNV, soraVehicleOcclusion, material.roughness);
        #endif
      `);
    };
    material.customProgramCacheKey = () => `${key}:sora-vehicle-ambient-v2`;
    material.needsUpdate = true;
  }
}
