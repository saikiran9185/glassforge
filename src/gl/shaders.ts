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
uniform float u_period;
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

/** Separable Gaussian, radius in texels. Softening the height map is what turns
 *  a hard-edged pattern into believable rolled glass. */
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
 * Measures the height map's own slope and stores it compressed into 0..1.
 *
 * Mipmapping this down to 1x1 gives the map's *average* steepness, which the
 * glass pass divides by. That is what makes the Distortion slider mean the same
 * thing for 6 bands and for 120 — it becomes a displacement amount, the way
 * Photoshop's Distortion slider is, instead of tracking pattern frequency.
 */
export const GRAD_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform vec2 u_texel;

void main() {
  float hR = texture(u_src, v_uv + vec2(u_texel.x, 0.0)).r;
  float hL = texture(u_src, v_uv - vec2(u_texel.x, 0.0)).r;
  float hU = texture(u_src, v_uv + vec2(0.0, u_texel.y)).r;
  float hD = texture(u_src, v_uv - vec2(0.0, u_texel.y)).r;
  vec2 grad = vec2((hR - hL) / (2.0 * u_texel.x), (hU - hD) / (2.0 * u_texel.y));
  float m = length(grad);
  outColor = vec4(vec3(m / (m + 1.0)), 1.0);   // squashed so 8 bits can hold any slope
}
`;

/** Straight grayscale view of one tile — matches exactly what gets exported. */
export const VIEW_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
void main() {
  float h = texture(u_src, v_uv).r;
  outColor = vec4(vec3(h), 1.0);
}
`;

/**
 * The refraction pass.
 *
 * Photoshop's Glass filter reads the texture's luminance as a height field and
 * pushes pixels along its slope. This does the same thing, plus the parts PS
 * makes you fake by hand: per-channel dispersion, frosted scattering, and a
 * specular bevel lit from the height normal.
 */
export const GLASS_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_img;
uniform sampler2D u_height;
uniform sampler2D u_grad;
uniform vec2 u_imgSize;
uniform vec2 u_tile;
uniform vec2 u_offset;
uniform float u_rotate;

uniform float u_distort;
uniform float u_chroma;
uniform float u_frost;
uniform float u_spec;
uniform float u_relief;
uniform float u_lightAngle;
uniform float u_tint;
uniform vec3  u_tintColor;

uniform int   u_reveal;
uniform vec2  u_revealPos;
uniform float u_revealSize;
uniform float u_revealFeather;
uniform float u_revealAngle;

const vec2 POISSON[12] = vec2[12](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696,  0.457),
  vec2(-0.203,  0.621), vec2( 0.962, -0.195), vec2( 0.473, -0.480),
  vec2( 0.519,  0.767), vec2( 0.185, -0.893), vec2( 0.507,  0.064),
  vec2( 0.896,  0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598)
);

mat2 rot(float deg) {
  float a = radians(deg);
  return mat2(cos(a), -sin(a), sin(a), cos(a));
}

/** image uv -> height-texture uv */
vec2 heightUV(vec2 uv) {
  return (rot(u_rotate) * (uv - 0.5)) * u_tile + 0.5 + u_offset;
}

float H(vec2 uv) { return texture(u_height, heightUV(uv)).r; }

vec3 sampleImg(vec2 uv, float radius) {
  if (radius < 0.0004) return texture(u_img, uv).rgb;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 12; i++) sum += texture(u_img, uv + POISSON[i] * radius).rgb;
  return sum / 12.0;
}

float revealMask(vec2 uv) {
  if (u_reveal == 0) return 1.0;
  vec2 d = rot(u_revealAngle) * (uv - u_revealPos);
  d.x *= u_imgSize.x / max(1.0, u_imgSize.y);
  float f = max(0.0008, u_revealFeather);
  if (u_reveal == 1) return smoothstep(-f, f, d.x);
  if (u_reveal == 2) return 1.0 - smoothstep(u_revealSize - f, u_revealSize + f, length(d));
  vec2 q = abs(d) - vec2(u_revealSize);
  float box = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return 1.0 - smoothstep(-f, f, box);
}

void main() {
  vec2 uv = v_uv;
  vec2 e = 1.0 / max(u_imgSize, vec2(1.0));

  // Central differences give d(height)/d(uv), so the strength of the effect
  // does not change when the texture or canvas resolution changes.
  float hR = H(uv + vec2(e.x, 0.0));
  float hL = H(uv - vec2(e.x, 0.0));
  float hU = H(uv + vec2(0.0, e.y));
  float hD = H(uv - vec2(0.0, e.y));
  vec2 grad = vec2((hR - hL) / (2.0 * e.x), (hU - hD) / (2.0 * e.y));

  // The 1x1 mip of the gradient pass is the map's mean slope; dividing by it
  // turns the raw gradient into "how steep is this spot relative to the rest of the
  // texture", so Distortion reads as an amount of displacement, not a
  // by-product of how many bands the pattern happens to have.
  float packed = textureLod(u_grad, vec2(0.5), 24.0).r;
  float meanSlope = packed / max(1e-4, 1.0 - packed);
  vec2 slope = grad / max(meanSlope, 1e-3);

  vec2 push = slope * u_distort * 0.005;
  // Past a third of the frame the image stops being readable, so ease it off
  // rather than letting a steep edge smear the whole picture.
  float pushLen = length(push);
  if (pushLen > 0.33) push *= 0.33 / pushLen;

  float frost = u_frost * 0.03;

  vec3 col;
  if (u_chroma > 0.001) {
    float s = u_chroma * 0.06;
    col.r = sampleImg(uv + push * (1.0 + s), frost).r;
    col.g = sampleImg(uv + push, frost).g;
    col.b = sampleImg(uv + push * (1.0 - s), frost).b;
  } else {
    col = sampleImg(uv + push, frost);
  }

  if (u_relief > 0.001 || u_spec > 0.001) {
    vec3 n = normalize(vec3(-slope * u_relief * 0.35, 1.0));
    vec3 L = normalize(vec3(cos(radians(u_lightAngle)), sin(radians(u_lightAngle)), 0.65));
    float dif = max(dot(n, L), 0.0);
    col *= mix(1.0, 0.55 + 0.9 * dif, clamp(u_relief, 0.0, 1.0));
    col += pow(dif, 28.0) * u_spec;
  }

  col = mix(col, col * u_tintColor, u_tint);

  vec3 base = texture(u_img, uv).rgb;
  outColor = vec4(mix(base, col, revealMask(uv)), 1.0);
}
`;
