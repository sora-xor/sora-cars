/** Finish the detailed, lit HDR scene in the cutscenes' illustrated language.
 * Geometry/depth and the original shaded material detail supply the marks.
 * The independent optional pixel pass and the single tone/output conversion
 * follow this pass; the HUD is composited afterward.
 */
export const cutsceneGrade = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D sceneDepth;
  uniform vec2 resolution;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float cameraPerspective;
  uniform float finishStrength;
  varying vec2 vUv;

  float depthAt(vec2 uv) {
    vec2 inset = 0.5 / resolution;
    return texture2D(sceneDepth, clamp(uv, inset, 1.0 - inset)).r;
  }
  float distanceAt(float depth) {
    float perspective = cameraNear * cameraFar / max(cameraFar - depth * (cameraFar - cameraNear), 0.000001);
    return mix(mix(cameraNear, cameraFar, depth), perspective, cameraPerspective);
  }
  float cutsceneLuminance(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }

  void main() {
    vec4 source = texture2D(tDiffuse, vUv);
    vec3 color = max(source.rgb, vec3(0.0));
    float light = cutsceneLuminance(color);
    float depth = depthAt(vUv);
    float surface = 1.0 - step(0.999999, depth);
    float distance = distanceAt(depth);
    float foreground = surface * (1.0 - smoothstep(65.0, 180.0, distance));

    // Neutral charcoal shadows leave violet to the exterior air; illuminated
    // ivory, red paint, brass and glass keep the actual light/material colors.
    // Dim but saturated amber/red pixels (lamp reflections on damp asphalt,
    // red paint in shade) are light, not shadow, so they keep their colour.
    // Surfaces merely lit by the peach key (warmth ~.7) still turn charcoal.
    float peakChannel = max(color.r, max(color.g, color.b));
    float warmth = (color.r - color.b) / max(peakChannel, 0.004);
    float shadow = (1.0 - smoothstep(0.015, 0.20, light)) * (1.0 - smoothstep(0.74, 0.9, warmth));
    vec3 charcoalBalance = vec3(light) * vec3(0.97, 0.955, 1.025);
    color = mix(color, charcoalBalance, shadow * foreground * 0.55);
    color *= 1.0 - 0.13 * shadow * foreground;

    // Gently group the broad value shapes without reducing source texture or
    // specular highlights to a small flat palette. A local detail residual
    // survives the grouping, and the transition has a continuous slope.
    vec2 px = 1.0 / resolution;
    float neighborhood = (cutsceneLuminance(texture2D(tDiffuse, vUv + vec2(px.x * 2.0, 0.0)).rgb)
      + cutsceneLuminance(texture2D(tDiffuse, vUv - vec2(px.x * 2.0, 0.0)).rgb)
      + cutsceneLuminance(texture2D(tDiffuse, vUv + vec2(0.0, px.y * 2.0)).rgb)
      + cutsceneLuminance(texture2D(tDiffuse, vUv - vec2(0.0, px.y * 2.0)).rgb)) * 0.25;
    float level = log2(1.0 + max(neighborhood, 0.0) * 6.0) * 3.0;
    float grouped = floor(level) + smoothstep(0.17, 0.83, fract(level));
    float groupedLight = (exp2(grouped / 3.0) - 1.0) / 6.0;
    float delta = (groupedLight - neighborhood) * 0.38;
    color *= max(0.0, 1.0 + delta / max(light, 0.035) * foreground * (1.0 - smoothstep(0.7, 1.6, light)));

    // Thin marks come from depth discontinuities/folds, not a texture-edge
    // detector that would ink every stone and leaf. Depth is affine across a
    // projected plane, so a flat graded road does not become an outlined grid.
    float left = depthAt(vUv - vec2(px.x, 0.0)), right = depthAt(vUv + vec2(px.x, 0.0));
    float down = depthAt(vUv - vec2(0.0, px.y)), up = depthAt(vUv + vec2(0.0, px.y));
    float meters = mix(cameraFar - cameraNear,
      distance * distance * (cameraFar - cameraNear) / max(cameraNear * cameraFar, 0.000001), cameraPerspective);
    float bend = max(abs(left + right - 2.0 * depth), abs(up + down - 2.0 * depth)) * meters;
    float crease = smoothstep(0.02 + distance * 0.0012, 0.075 + distance * 0.003, bend);
    float darkEdge = 1.0 - smoothstep(0.18, 0.8, light);
    vec3 ink = min(color, vec3(0.0038, 0.0029, 0.0046));
    color = mix(color, ink, crease * foreground * darkEdge * 0.58);

    gl_FragColor = vec4(mix(source.rgb, max(color, vec3(0.0)), clamp(finishStrength, 0.0, 1.0)), source.a);
  }
`;
