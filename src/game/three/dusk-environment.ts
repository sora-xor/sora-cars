import * as THREE from 'three';

/** Art-directed blue-hour adaptation of the licensed HDR capture. The same
 * linear radiance texture lights materials and appears behind the scene.
 */
export function createDuskEnvironment(renderer: THREE.WebGLRenderer, source: THREE.DataTexture): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(source.image.width, source.image.height, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  target.texture.name = 'SORA blue-hour HDR radiance';
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  target.texture.mapping = THREE.EquirectangularReflectionMapping;
  const material = new THREE.ShaderMaterial({
    uniforms: { capture: { value: source } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: /* glsl */ `
      uniform sampler2D capture;
      varying vec2 vUv;
      void main(){
        vec3 radiance = texture2D(capture, vUv).rgb;
        float altitude = sin((vUv.y - 0.5) * 3.14159265);
        // A warm horizon remains below a muted violet upper sky. Saturated
        // violet belongs to the visible painted sky and the air; as ambient on
        // lit surfaces it becomes the rejected lavender wash, so the zenith is
        // only slightly violet (up-facing ambient h306, about half the former
        // chroma at similar luminance). Retain all original cloud structure
        // and unclipped HDR highlight relationships.
        vec3 horizon = vec3(1.00, 0.80, 0.95);
        vec3 zenith = vec3(0.80, 0.62, 0.85);
        vec3 skyBalance = mix(horizon, zenith, smoothstep(0.035, 0.42, altitude));
        vec3 balance = mix(vec3(0.90, 0.86, 0.92), skyBalance, smoothstep(-0.12, 0.01, altitude));
        gl_FragColor = vec4(radiance * balance, 1.0);
      }
    `,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
  });
  const scene = new THREE.Scene(), geometry = new THREE.PlaneGeometry(2, 2);
  scene.add(new THREE.Mesh(geometry, material));
  const previous = renderer.getRenderTarget(), viewport = new THREE.Vector4(), scissor = new THREE.Vector4();
  renderer.getViewport(viewport); renderer.getScissor(scissor);
  const scissorTest = renderer.getScissorTest(), autoClear = renderer.autoClear;
  try {
    renderer.setRenderTarget(target); renderer.setScissorTest(false); renderer.autoClear = true;
    renderer.render(scene, new THREE.Camera());
  } finally {
    renderer.setRenderTarget(previous); renderer.setViewport(viewport); renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest); renderer.autoClear = autoClear;
    geometry.dispose(); material.dispose();
  }
  return target;
}
