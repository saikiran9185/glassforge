import { COMMON_GLSL } from "../patterns/common.glsl";
import { Pattern } from "../patterns/types";

export const VERT = /* glsl */ `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/**
 * Builds the height-map shader for a pattern: the shared prelude, one uniform
 * per declared param, the pattern body, then the shared level controls.
 */
export function buildHeightFS(pattern: Pattern): string {
  const uniforms = pattern.params.map((x) => `uniform float u_${x.key};`).join("\n");
  return `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform float u_seed;
uniform float u_contrast;
uniform float u_brightness;
uniform float u_invert;
${uniforms}

${COMMON_GLSL}

${pattern.glsl}

void main() {
  float h = clamp(patternHeight(v_uv), 0.0, 1.0);
  h = mix(h, 1.0 - h, u_invert);
  h = clamp((h - 0.5) * u_contrast + 0.5 + u_brightness, 0.0, 1.0);
  outColor = vec4(vec3(h), 1.0);
}
`;
}

/**
 * Separable Gaussian, radius in texels.
 *
 * This is the control that matters most: the Glass filter turns a height step
 * into a hard displacement edge and a height ramp into a smooth bend, so
 * blurring the map is the difference between etched and rolled glass.
 */
export const BLUR_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform vec2 u_dir;
uniform float u_radius;

void main() {
  if (u_radius < 0.01) { outColor = texture(u_src, v_uv); return; }
  float sigma = max(0.6, u_radius * 0.5);
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  for (int i = -24; i <= 24; i++) {
    float fi = float(i);
    if (abs(fi) > u_radius) continue;
    float w = exp(-fi * fi / (2.0 * sigma * sigma));
    sum += texture(u_src, v_uv + u_dir * fi) * w;
    wsum += w;
  }
  outColor = sum / wsum;
}
`;

/**
 * Grayscale view of the map. `u_repeat` draws the tile more than once so seams
 * are visible; the exported file is always a single tile at repeat 1.
 */
export const VIEW_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform float u_repeat;
uniform float u_guides;

void main() {
  vec2 uv = v_uv * u_repeat;
  outColor = vec4(vec3(texture(u_src, uv).r), 1.0);

  if (u_guides > 0.5 && u_repeat > 1.5) {
    vec2 t = fract(uv);
    vec2 w = fwidth(uv) * 1.5;
    float line = max(step(t.x, w.x), step(t.y, w.y));
    outColor.rgb = mix(outColor.rgb, vec3(0.35, 0.62, 1.0), line * 0.55);
  }
}
`;
