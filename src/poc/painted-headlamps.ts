import * as THREE from 'three';

/** Sealed-beam glass and reflector marks live on the actual raised lamp mesh. */
export function refineParkedHeadlamps(root: THREE.Object3D) {
  const seen = new Set<THREE.Material>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !String(object.userData.shadowKey).includes(':true:LampCovers')) return;
    const material = object.material;
    if (!(material instanceof THREE.MeshStandardMaterial) || seen.has(material)) return;
    seen.add(material);

    // The source batches both covers in car-local metres. Mirror X so both
    // lamps receive the same optical construction, normalized to their lens.
    const positions = object.geometry.getAttribute('position');
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let index = 0; index < positions.count; index++) {
      const x = Math.abs(positions.getX(index)), y = positions.getY(index);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const lensBounds = new THREE.Vector4(minX, minY, Math.max(.001, maxX - minX), Math.max(.001, maxY - minY));
    material.color.set('#c0b396');
    material.emissive.set('#ffd09a');
    material.emissiveIntensity = .9;
    material.roughness = .26;
    material.envMapIntensity = .45;
    if (material instanceof THREE.MeshPhysicalMaterial) {
      material.clearcoat = .18;
      material.clearcoatRoughness = .26;
    }

    const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      shader.uniforms.lampLensBounds = { value: lensBounds };
      shader.vertexShader = `varying vec3 vLampPosition;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        vLampPosition = position;
      `);
      shader.fragmentShader = /* glsl */ `
        varying vec3 vLampPosition;
        uniform vec4 lampLensBounds;
        float lampCellHash(vec2 p) {
          vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
          q += dot(q, q.yzx + 33.33);
          return fract((q.x + q.y) * q.z);
        }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        vec2 lampUv = clamp((vec2(abs(vLampPosition.x), vLampPosition.y) - lampLensBounds.xy)
          / lampLensBounds.zw, 0., 1.);
        vec2 lampCells = lampUv * vec2(9., 6.);
        vec2 lampCell = floor(lampCells), lampCellUv = fract(lampCells);
        vec2 lampFootprint = max(fwidth(lampCells), vec2(.001));
        float lampResolved = 1. - smoothstep(.55, 1.35, max(lampFootprint.x, lampFootprint.y));
        vec2 lampEdgeDistance = min(lampCellUv, 1. - lampCellUv);
        vec2 lampCellInside = smoothstep(vec2(.015), vec2(.075) + lampFootprint * .6, lampEdgeDistance);
        float lampDivider = lampCellInside.x * lampCellInside.y;
        float lampChoice = lampCellHash(lampCell);
        // Unequal reflector planes catch a few cream patches among darker
        // amber cells; their broad folds survive the final two-pixel grid.
        float lampFold = clamp(.2 + lampCellUv.x * .65 + abs(lampCellUv.y - .46) * .9, 0., 1.);
        float lampFacet = mix(.20, 1.05, smoothstep(.12, .85, lampChoice)) * lampFold;
        float lampPrismPhase = lampUv.x * 14. + lampUv.y * .35;
        float lampPrismResolved = 1. - smoothstep(.55, 1.35, fwidth(lampPrismPhase));
        float lampPrism = pow(.5 + .5 * cos(lampPrismPhase * 6.2831853), 7.);
        lampFacet += lampPrism * .48 * lampPrismResolved;
        lampFacet *= mix(.12, 1., lampDivider);
        lampFacet = mix(.46, lampFacet, lampResolved);
        vec2 lampRimDistance = min(lampUv, 1. - lampUv);
        vec2 lampRim = smoothstep(vec2(.005), vec2(.047) + fwidth(lampUv) * .5, lampRimDistance);
        float lampLensInterior = lampRim.x * lampRim.y;
        lampFacet *= mix(.22, 1., lampLensInterior);
        vec3 lampGlassTint = mix(vec3(.63, .48, .29), vec3(1.06, 1.01, .85), smoothstep(.1, .9, lampFacet));
        diffuseColor.rgb *= lampGlassTint * (.38 + lampFacet * .72);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', /* glsl */ `
        #include <emissivemap_fragment>
        vec2 lampCorePosition = (lampUv - vec2(.52, .48)) * vec2(5.5, 8.);
        float lampCore = exp(-dot(lampCorePosition, lampCorePosition));
        totalEmissiveRadiance *= (.055 + lampFacet * 1.16 + lampCore * .20 * lampLensInterior)
          * mix(vec3(1., .76, .46), vec3(1., 1., .92), smoothstep(.13, .85, lampFacet));
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', /* glsl */ `
        #include <lights_fragment_end>
        // A broad softbox must not fill every structural divider with the
        // same white highlight and erase the sealed-beam construction.
        float lampReflection = .22 + .78 * clamp(lampFacet, 0., 1.);
        reflectedLight.directSpecular *= lampReflection;
        reflectedLight.indirectSpecular *= lampReflection;
      `);
    };
    material.customProgramCacheKey = () => `${previousKey}:poc-sealed-beam-reflector-v2`;
    material.needsUpdate = true;
  });
}
