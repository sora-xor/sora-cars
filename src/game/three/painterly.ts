import * as THREE from 'three';

export interface PainterlyPass {
  /** Width and height are output pixels; the caller retains camera/projection ownership. */
  render(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number, time: number): void;
  dispose(): void;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D sceneColor;
  uniform sampler2D sceneDepth;
  uniform vec2 resolution;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float cameraPerspective;
  uniform float cameraSpan;
  varying vec2 vUv;

  float viewDistance(float depth) {
    float perspective = cameraNear * cameraFar
      / max(cameraFar - depth * (cameraFar - cameraNear), 0.00001);
    return mix(mix(cameraNear, cameraFar, depth), perspective, cameraPerspective);
  }

  float pigmentLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  // Stable paper, rather than frame-random film noise, keeps motion legible.
  float paper(vec2 point) {
    vec3 p = fract(vec3(point.xyx) * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float bayer2(vec2 cell) {
    cell = mod(cell, 2.0);
    return 2.0 * cell.x + 3.0 * cell.y - 4.0 * cell.x * cell.y;
  }

  float bayer4(vec2 cell) {
    return (4.0 * bayer2(cell) + bayer2(floor(cell * 0.5)) + 0.5) / 16.0;
  }

  vec3 brightPigment(vec3 color) {
    // Smoothly confine light spill to genuinely luminous surfaces.
    return color * smoothstep(0.8, 2.8, pigmentLuminance(color));
  }

  void main() {
    vec2 texel = 1.0 / resolution;
    vec2 cell = min(floor(vUv * resolution), resolution - 1.0);
    vec2 uv = (cell + 0.5) * texel;

    // Nine color reads serve the quiet pigment boundary and highlight spread.
    vec4 center = texture2D(sceneColor, uv);
    vec3 north = texture2D(sceneColor, uv + vec2(0.0, texel.y)).rgb;
    vec3 south = texture2D(sceneColor, uv - vec2(0.0, texel.y)).rgb;
    vec3 east = texture2D(sceneColor, uv + vec2(texel.x, 0.0)).rgb;
    vec3 west = texture2D(sceneColor, uv - vec2(texel.x, 0.0)).rgb;
    vec3 ne = texture2D(sceneColor, uv + texel).rgb;
    vec3 nw = texture2D(sceneColor, uv + vec2(-texel.x, texel.y)).rgb;
    vec3 se = texture2D(sceneColor, uv + vec2(texel.x, -texel.y)).rgb;
    vec3 sw = texture2D(sceneColor, uv - texel).rgb;

    // The resolved MSAA depth supplies one-pixel silhouette and crease strokes.
    // Hardware depth is affine across projected planes: its second difference
    // rejects an ordinary road slope, even when its texture is very contrasty.
    float centerDepth = texture2D(sceneDepth, uv).x;
    float northDepth = texture2D(sceneDepth, uv + vec2(0.0, texel.y)).x;
    float southDepth = texture2D(sceneDepth, uv - vec2(0.0, texel.y)).x;
    float eastDepth = texture2D(sceneDepth, uv + vec2(texel.x, 0.0)).x;
    float westDepth = texture2D(sceneDepth, uv - vec2(texel.x, 0.0)).x;
    float distance = viewDistance(centerDepth);
    float depthCurve = max(abs(northDepth + southDepth - 2.0 * centerDepth),
      abs(eastDepth + westDepth - 2.0 * centerDepth));
    // Convert depth-buffer curvature to relative view-space distance. This
    // removes the nonlinear near/far dependence of a perspective depth buffer.
    float curveScale = mix((cameraFar - cameraNear) / max(cameraSpan, 0.01),
      distance * (cameraFar - cameraNear) / (cameraNear * cameraFar), cameraPerspective);
    float crease = smoothstep(0.012, 0.075, depthCurve * curveScale);
    float fartherNeighbor = max(max(viewDistance(northDepth), viewDistance(southDepth)),
      max(viewDistance(eastDepth), viewDistance(westDepth))) - distance;
    float pixelFootprint = cameraSpan * mix(1.0, distance, cameraPerspective) / resolution.y;
    float foregroundSide = smoothstep(pixelFootprint * 0.4, pixelFootprint * 2.0, fartherNeighbor);
    float surface = 1.0 - step(0.999999, centerDepth);
    float depthInk = crease * foregroundSide * surface * 0.26;

    float light = pigmentLuminance(center.rgb);
    float northLight = pigmentLuminance(north);
    float southLight = pigmentLuminance(south);
    float eastLight = pigmentLuminance(east);
    float westLight = pigmentLuminance(west);
    float neighborhood = (northLight + southLight + eastLight + westLight) * 0.25;
    float gradient = length(vec2(eastLight - westLight, northLight - southLight));
    float relativeEdge = gradient / (0.08 + light + neighborhood);

    // Pigment-only boundaries stay faint; texture detail must not turn into
    // ink noise on asphalt or already-painted clouds behind the depth buffer.
    float shadowSide = smoothstep(0.006, 0.15, neighborhood - light);
    float pigmentInk = smoothstep(0.42, 1.1, relativeEdge) * shadowSide * surface * 0.045;
    float ink = max(depthInk, pigmentInk);
    vec3 color = center.rgb;

    vec3 glow = brightPigment(north) + brightPigment(south)
      + brightPigment(east) + brightPigment(west)
      + brightPigment(ne) + brightPigment(nw)
      + brightPigment(se) + brightPigment(sw);
    color += min(glow * 0.0019, vec3(0.035));

    // Small linear-light pigment shifts retain existing cutscene art colors.
    float shadows = 1.0 - smoothstep(0.025, 0.32, light);
    float highlights = smoothstep(0.35, 1.3, light);
    color *= vec3(1.0) + shadows * vec3(-0.025, -0.012, 0.028)
      + highlights * vec3(0.027, 0.007, -0.018);

    gl_FragColor = vec4(max(color, vec3(0.0)), center.a);

    // Offscreen Three renders remain linear HDR. These chunks apply the
    // renderer's chosen tone mapper and output transfer exactly once, here.
    #include <tonemapping_fragment>
    #include <colorspace_fragment>

    // Lay the indigo ink onto the display-space pigment after the single tone
    // conversion, so bright paint keeps a readable contour instead of washing it out.
    vec3 inkPigment = min(gl_FragColor.rgb, vec3(0.075, 0.094, 0.157));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, inkPigment, ink);

    // Dither in display space, at fine resolution, without palette banding.
    float ordered = (bayer4(cell) - 0.5) / 128.0;
    float grain = (paper(cell) - 0.5) * 0.014;
    float fibre = (paper(floor(cell * vec2(0.27, 0.7))) - 0.5) * 0.002;
    gl_FragColor.rgb = clamp(gl_FragColor.rgb + (ordered + grain + fibre)
      * gl_FragColor.a, 0.0, 1.0);
  }
`;

/** Fine painted finishing for the 3D world; HUD composition happens afterward. */
export function createPainterlyPass(renderer: THREE.WebGLRenderer): PainterlyPass {
  const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  depth.name = 'SORA painted world — resolved scene depth';
  depth.minFilter = depth.magFilter = THREE.NearestFilter;
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    depthTexture: depth,
    resolveDepthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false,
    samples: Math.min(4, renderer.capabilities.maxSamples),
  });
  target.texture.name = 'SORA painted world — linear HDR';
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;

  const uniforms = {
    sceneColor: { value: target.texture },
    sceneDepth: { value: depth },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 600 },
    cameraPerspective: { value: 1 },
    cameraSpan: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'SORA fine painted finish',
    uniforms,
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: true,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;
  const outputScene = new THREE.Scene();
  outputScene.add(quad);
  const outputCamera = new THREE.Camera();
  const drawingBuffer = new THREE.Vector2();
  const savedViewport = new THREE.Vector4();
  const savedScissor = new THREE.Vector4();
  let disposed = false;

  return {
    render(scene, camera, width, height, _time) {
      if (disposed || !Number.isFinite(width) || !Number.isFinite(height)
        || width <= 0 || height <= 0) return;

      const outputWidth = Math.max(1, Math.round(width));
      const outputHeight = Math.max(1, Math.round(height));
      const internalHeight = Math.min(outputHeight, 900);
      const internalWidth = Math.max(1, Math.round(outputWidth * internalHeight / outputHeight));
      if (target.width !== internalWidth || target.height !== internalHeight) {
        target.setSize(internalWidth, internalHeight);
        uniforms.resolution.value.set(internalWidth, internalHeight);
      }

      const projection = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
      const near = Math.max(0.00001, projection.near ?? 0.1);
      uniforms.cameraNear.value = near;
      uniforms.cameraFar.value = Math.max(near + 0.00001, projection.far ?? 600);
      uniforms.cameraPerspective.value = camera.projectionMatrix.elements[11] === -1 ? 1 : 0;
      uniforms.cameraSpan.value = 2 / Math.max(Math.abs(camera.projectionMatrix.elements[5]!), 0.00001);

      renderer.getDrawingBufferSize(drawingBuffer);
      if (drawingBuffer.x !== outputWidth || drawingBuffer.y !== outputHeight
        || renderer.getPixelRatio() !== 1) {
        // The dimensions supplied by the caller are physical output pixels.
        renderer.setDrawingBufferSize(outputWidth, outputHeight, 1);
      }

      const savedTarget = renderer.getRenderTarget();
      const savedCubeFace = renderer.getActiveCubeFace();
      const savedMipmapLevel = renderer.getActiveMipmapLevel();
      const savedAutoClear = renderer.autoClear;
      const savedScissorTest = renderer.getScissorTest();
      const savedXrEnabled = renderer.xr.enabled;
      renderer.getViewport(savedViewport);
      renderer.getScissor(savedScissor);

      try {
        renderer.xr.enabled = false;
        renderer.autoClear = false;
        renderer.setScissorTest(false);
        renderer.setRenderTarget(target);
        renderer.setViewport(0, 0, internalWidth, internalHeight);
        renderer.clear(true, true, true);
        renderer.render(scene, camera);

        renderer.setRenderTarget(null);
        renderer.setViewport(0, 0, outputWidth, outputHeight);
        renderer.render(outputScene, outputCamera);
      } finally {
        renderer.setRenderTarget(savedTarget, savedCubeFace, savedMipmapLevel);
        renderer.setViewport(savedViewport);
        renderer.setScissor(savedScissor);
        renderer.setScissorTest(savedScissorTest);
        renderer.autoClear = savedAutoClear;
        renderer.xr.enabled = savedXrEnabled;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      target.dispose();
      geometry.dispose();
      material.dispose();
      outputScene.clear();
    },
  };
}
