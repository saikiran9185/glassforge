/**
 * The glass-object pipeline.
 *
 * Liquid glass, Figma's glass material and glass type are the same effect: a
 * *shape* with thickness sitting over a backdrop. Thickness is near-flat through
 * the middle and falls off at the rim, so refraction concentrates at the edge —
 * that edge lensing plus a specular rim is what reads as "glass" rather than
 * "blurred rectangle".
 *
 * Analytic shapes get an exact SDF. Text and uploaded images come in as a mask
 * pair (crisp for coverage, CPU-blurred for thickness), which keeps one code
 * path for every shape.
 */

export const SDF_GLSL = /* glsl */ `
float sdRoundRect(vec2 p, vec2 b, float r) {
  r = min(r, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float sdCircle(vec2 p, float r) { return length(p) - r; }

mat2 rot2(float deg) {
  float a = radians(deg);
  return mat2(cos(a), -sin(a), sin(a), cos(a));
}

/**
 * Maps normalised depth-into-the-shape to thickness.
 *  k = 0  convex dome  — a magnifying bead
 *  k = 1  flat top with a beveled rim — the liquid-glass / Figma look
 *  k = 2  hard shoulder — a thin sheet with a sharp edge
 */
float thicknessProfile(float t, float k) {
  float dome  = sqrt(max(0.0, 1.0 - (1.0 - t) * (1.0 - t)));
  float bevel = smoothstep(0.0, 1.0, t);
  float sheet = smoothstep(0.0, 0.3, t);
  return k < 1.0 ? mix(dome, bevel, k) : mix(bevel, sheet, k - 1.0);
}
`;

/** Writes thickness in .r and coverage in .g. */
export const THICKNESS_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform int   u_shape;        // 0 rrect, 1 circle, 2 pill, 3 mask (text / image)
uniform vec2  u_center;
uniform vec2  u_size;         // half-extents, aspect-corrected space
uniform float u_radius;
uniform float u_rotation;
uniform float u_aspect;
uniform float u_edge;
uniform float u_profile;

uniform sampler2D u_mask;     // crisp alpha
uniform sampler2D u_maskSoft; // blurred alpha, used as a thickness ramp

uniform sampler2D u_pattern;
uniform float u_patternAmt;
uniform float u_patternScale;

${SDF_GLSL}

void main() {
  float t, cov;

  if (u_shape == 3) {
    cov = texture(u_mask, v_uv).a;
    t = clamp(texture(u_maskSoft, v_uv).a, 0.0, 1.0);
  } else {
    vec2 p = v_uv - u_center;
    p.x *= u_aspect;
    p = rot2(u_rotation) * p;

    float d;
    if (u_shape == 1)      d = sdCircle(p, min(u_size.x, u_size.y));
    else if (u_shape == 2) d = sdRoundRect(p, u_size, min(u_size.x, u_size.y));
    else                   d = sdRoundRect(p, u_size, u_radius);

    float aa = max(fwidth(d), 1e-5);
    cov = 1.0 - smoothstep(-aa, aa, d);
    t = clamp(-d / max(u_edge, 1e-4), 0.0, 1.0);
  }

  float h = thicknessProfile(t, u_profile);

  // A surface texture rides on top of the thickness, so a pill can be fluted.
  if (u_patternAmt > 0.001) {
    float pv = texture(u_pattern, v_uv * u_patternScale).r - 0.5;
    h = clamp(h + pv * u_patternAmt * smoothstep(0.0, 0.12, t), 0.0, 1.0);
  }

  outColor = vec4(h, cov, 0.0, 1.0);
}
`;

/** Plain copy, used to downsample the backdrop before blurring it. */
export const BLIT_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
void main() { outColor = texture(u_src, v_uv); }
`;

export const LENS_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_backdrop;
uniform sampler2D u_backdropBlur;
uniform sampler2D u_thick;
uniform sampler2D u_thickBlur;
uniform vec2 u_res;

uniform float u_edge;
uniform float u_refract;
uniform float u_disperse;
uniform float u_frost;
uniform float u_tintAmt;
uniform vec3  u_tintColor;
uniform float u_spec;
uniform float u_specWidth;
uniform float u_light;
uniform float u_bump;
uniform float u_shadow;
uniform vec2  u_shadowOffset;
uniform float u_innerGlow;

vec3 backdropAt(vec2 uv, float frost) {
  vec3 sharp = texture(u_backdrop, uv).rgb;
  if (frost < 0.002) return sharp;
  return mix(sharp, texture(u_backdropBlur, uv).rgb, clamp(frost, 0.0, 1.0));
}

void main() {
  vec2 e = 1.0 / max(u_res, vec2(1.0));
  float cov = texture(u_thick, v_uv).g;

  float hR = texture(u_thick, v_uv + vec2(e.x, 0.0)).r;
  float hL = texture(u_thick, v_uv - vec2(e.x, 0.0)).r;
  float hU = texture(u_thick, v_uv + vec2(0.0, e.y)).r;
  float hD = texture(u_thick, v_uv - vec2(0.0, e.y)).r;
  vec2 grad = vec2((hR - hL) / (2.0 * e.x), (hU - hD) / (2.0 * e.y));

  // The raw gradient scales as 1/edge, so a narrow rim would displace further
  // than a wide one — backwards, and violent enough to alias. Multiplying by
  // the rim width normalises it to O(1) "steepness", and the displacement is
  // then a fraction of the rim itself: narrow rim, tight bend; fat bead, wide
  // bend. It also makes every control behave the same at any canvas size.
  vec2 slope = grad * u_edge;
  vec2 push = -slope * u_edge * u_refract * 0.8;
  float pushLen = length(push);
  if (pushLen > 0.22) push *= 0.22 / pushLen;

  // Where the lens pushes hardest it compresses the most backdrop into each
  // pixel, so lean on the pre-blurred copy in proportion — that prefilters the
  // sampling, and matches how a real edge softens what it squeezes.
  float frost = max(u_frost, clamp(pushLen * 9.0, 0.0, 1.0) * 0.6);

  vec3 col;
  if (u_disperse > 0.001) {
    float d = u_disperse * 0.08;
    col.r = backdropAt(v_uv + push * (1.0 + d), frost).r;
    col.g = backdropAt(v_uv + push, frost).g;
    col.b = backdropAt(v_uv + push * (1.0 - d), frost).b;
  } else {
    col = backdropAt(v_uv + push, frost);
  }

  col = mix(col, col * u_tintColor + u_tintColor * 0.12, u_tintAmt);

  vec3 n = normalize(vec3(-slope * u_bump, 1.0));
  vec3 L = normalize(vec3(cos(radians(u_light)), sin(radians(u_light)), 0.72));
  float dif = max(dot(n, L), 0.0);
  col += pow(dif, mix(48.0, 5.0, u_specWidth)) * u_spec;

  // A faint bright lip all round the rim, independent of light direction.
  col += clamp(length(slope), 0.0, 3.0) * 0.14 * u_innerGlow;

  vec3 base = texture(u_backdrop, v_uv).rgb;
  if (u_shadow > 0.001) {
    float sh = texture(u_thickBlur, v_uv - u_shadowOffset).g;
    base *= 1.0 - clamp(sh, 0.0, 1.0) * u_shadow * (1.0 - cov);
  }

  outColor = vec4(mix(base, col, clamp(cov, 0.0, 1.0)), 1.0);
}
`;
