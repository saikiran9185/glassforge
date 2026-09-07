import { Pattern, p } from "./types";

/**
 * Droplets on a jittered grid. Each drop is a lens dome (sqrt(1 - d^2)), which
 * is the height profile that makes a bead of water actually invert the image
 * behind it. Trail draws the tapering streak a running drop leaves.
 */
export const rain: Pattern = {
  id: "rain",
  name: "Rain / droplets",
  blurb: "Water beads and runs on a window. Stretch + Trail turn beads into streaks.",
  params: [
    p("density", "Density", 2, 48, 1, 14),
    p("size", "Drop size", 0.1, 2.5, 0.01, 0.9),
    p("coverage", "Coverage", 0, 1, 0.01, 0.6, "Fraction of grid cells that get a drop"),
    p("stretch", "Stretch", 0.2, 5, 0.05, 1, "Elongate drops vertically"),
    p("trail", "Trail", 0, 1, 0.01, 0),
    p("softness", "Edge softness", 0, 1, 0.01, 0.25),
    p("mist", "Mist", 0, 1, 0.01, 0.15, "Fine condensation between the drops"),
  ],
  glsl: /* glsl */ `
float patternHeight(vec2 uv) {
  float n = max(2.0, floor(u_density + 0.5));
  vec2 pt = uv * n;
  vec2 ip = floor(pt), fp = fract(pt);

  float h = 0.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 cell = ip + g;
      if (hash21p(cell, n, u_seed + 9.3) > u_coverage) continue;

      vec2 o = hash22p(cell, n, u_seed);
      float rad = mix(0.14, 0.46, hash21p(cell, n, u_seed + 2.2)) * u_size;
      vec2 r = fp - (g + o);
      vec2 rs = vec2(r.x, r.y / max(0.05, u_stretch));

      // A true lens profile has infinite slope at the rim, which smears the
      // refraction into pie wedges. Tapering the outer 15% bounds the slope
      // while keeping the lens character through the middle of the bead.
      float d = length(rs) / max(0.001, rad);
      float dome = sqrt(max(0.0, 1.0 - d * d)) * smoothstep(1.0, 0.85, d);
      h = max(h, pow(dome, mix(3.0, 0.4, u_softness)));

      if (u_trail > 0.004) {
        float len = rad * mix(0.0, 9.0, u_trail);
        float ty = rs.y / max(0.001, len);
        if (ty > 0.0 && ty < 1.0) {
          // Narrow the run as it fades, so it reads as a trail rather than a bar.
          float fade = 1.0 - ty;
          float halfWidth = rad * 0.45 * (0.3 + 0.7 * fade);
          float across = smoothstep(1.0, 0.0, abs(rs.x) / max(0.001, halfWidth));
          h = max(h, fade * fade * across * 0.8);
        }
      }
    }
  }

  if (u_mist > 0.001) {
    float m = fbm(uv * n * 3.0, n * 3.0, u_seed + 41.0, 3);
    h = max(h, m * u_mist * 0.5);
  }
  return h;
}
`,
};
