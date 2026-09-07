/**
 * Shared GLSL prelude available to every pattern.
 *
 * Everything here is *periodic*: the hash wraps on `period`, so noise, voronoi
 * and droplet fields tile seamlessly as long as you pass `u_period` through.
 * That is what lets the preview repeat the texture without visible seams.
 */
export const COMMON_GLSL = /* glsl */ `
#define PI 3.14159265359

float hash21p(vec2 p, float period, float seed) {
  p = mod(p, vec2(period)) + seed * 17.0;
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22p(vec2 p, float period, float seed) {
  p = mod(p, vec2(period)) + seed * 17.0;
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

/** Tileable value noise. Doubling p must double period — see fbm below. */
float vnoise(vec2 p, float period, float seed) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21p(i + vec2(0.0, 0.0), period, seed);
  float b = hash21p(i + vec2(1.0, 0.0), period, seed);
  float c = hash21p(i + vec2(0.0, 1.0), period, seed);
  float d = hash21p(i + vec2(1.0, 1.0), period, seed);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p, float period, float seed, int octaves) {
  float sum = 0.0, amp = 0.5, norm = 0.0, per = period;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * vnoise(p, per, seed + float(i) * 3.7);
    norm += amp;
    p *= 2.0;
    per *= 2.0;
    amp *= 0.5;
  }
  return norm > 0.0 ? sum / norm : 0.0;
}

/** Ridged variant — sharp creases instead of soft lumps. */
float fbmRidged(vec2 p, float period, float seed, int octaves) {
  float sum = 0.0, amp = 0.5, norm = 0.0, per = period;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    float n = vnoise(p, per, seed + float(i) * 3.7);
    sum += amp * (1.0 - abs(n * 2.0 - 1.0));
    norm += amp;
    p *= 2.0;
    per *= 2.0;
    amp *= 0.5;
  }
  return norm > 0.0 ? sum / norm : 0.0;
}

/**
 * Tileable Voronoi.
 *  d1  distance to nearest feature point
 *  d2  distance to second nearest (d2 - d1 gives clean cell borders)
 *  rel vector from the nearest feature point to p — lets a cell be shaded as a
 *      tilted plane, which is what makes shards refract like real glass
 *  cid stable per-cell random id
 */
void voronoi(vec2 p, float period, float seed, float jitter,
             out float d1, out float d2, out vec2 rel, out float cid) {
  vec2 ip = floor(p), fp = fract(p);
  d1 = 8.0; d2 = 8.0; rel = vec2(0.0); cid = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = mix(vec2(0.5), hash22p(ip + g, period, seed), jitter);
      vec2 r = g + o - fp;
      float d = length(r);
      if (d < d1) {
        d2 = d1; d1 = d;
        rel = -r;
        cid = hash21p(ip + g, period, seed + 5.1);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
}

/**
 * Direction vector for a striped field at ~angleDeg with \`count\` repeats.
 * Both components are rounded to integers so dot(uv, dir) is exactly periodic
 * over the unit tile — the stripes stay seamless at any angle. The realised
 * angle can differ from the requested one by a degree or two at low counts;
 * that is the price of a seamless tile.
 */
vec2 stripeDir(float count, float angleDeg) {
  float a = radians(angleDeg);
  vec2 n = vec2(cos(a), sin(a)) * count;
  vec2 r = floor(n + 0.5);
  if (abs(r.x) + abs(r.y) < 1.0) r = vec2(1.0, 0.0);
  return r;
}

/** Sawtooth (0..1 ramp, like the tutorial's black-to-transparent gradient). */
float sawtooth(float x) { return fract(x); }

/** Blend between a hard ramp, a soft sine, and a rounded lens profile. */
float ridgeProfile(float t, float profile) {
  float saw = t;
  float sine = 0.5 - 0.5 * cos(t * 2.0 * PI);
  float lens = sqrt(max(0.0, 1.0 - pow(t * 2.0 - 1.0, 2.0)));
  return profile < 1.0 ? mix(saw, sine, profile) : mix(sine, lens, profile - 1.0);
}
`;
