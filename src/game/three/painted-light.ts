import * as THREE from 'three';
const styled = new WeakSet<THREE.Material>();

/** Band diffuse illumination while preserving the authored pigment and live reflections. */
export function applyPaintedLight(root: THREE.Object3D): void {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial) || styled.has(material)
        || material.roughness < 0.4 || material.metalness > 0.6) continue;
      styled.add(material);
      const previous = material.onBeforeCompile, cacheKey = material.customProgramCacheKey.bind(material);
      const previousKey = cacheKey();
      material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `
          #include <lights_fragment_end>
          vec3 soraDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
          float soraPigment = max(dot(material.diffuseColor, vec3(0.2126, 0.7152, 0.0722)), 0.035);
          float soraLight = dot(soraDiffuse, vec3(0.2126, 0.7152, 0.0722)) / soraPigment;
          float soraLevel = log2(1.0 + soraLight) * 6.0;
          float soraBand = floor(soraLevel) + smoothstep(0.32, 0.68, fract(soraLevel));
          float soraPaintLight = exp2(soraBand / 6.0) - 1.0;
          float soraRatio = mix(1.0, soraPaintLight / max(soraLight, 0.001), 0.72);
          reflectedLight.directDiffuse *= soraRatio;
          reflectedLight.indirectDiffuse *= soraRatio;
        `);
      };
      material.customProgramCacheKey = () => `${previousKey}:sora-painted-diffuse-v1`;
      material.needsUpdate = true;
    }
  });
}
