import { Pattern, p } from "./types";

/**
 * The general-purpose one: fbm for frosted glass, ridged fbm for creased/crumpled,
 * domain warp for molten, and a two-axis sine interference for wavy antique glass.
 */
export const noise: Pattern = {
  id: "noise",
  name: "Noise & waves",
  blurb: "Frosted, molten and antique-wave glass. Ridged creases it; Warp melts it.",
  params: [
    p("scale", "Scale", 1, 32, 1, 6),
    p("octaves", "Detail", 1, 8, 1, 4),
    p("ridged", "Ridged", 0, 1, 0.01, 0),
    p("warp", "Warp", 0, 1, 0.01, 0.2, "Domain warp — molten/liquid look"),
    p("warpFreq", "Warp scale", 1, 10, 1, 2),
    p("waves", "Waves", 0, 1, 0.01, 0, "Blend in sine interference"),
    p("waveCount", "Wave count", 1, 40, 1, 8),
    p("waveAngle", "Wave angle", 0, 180, 1, 20),
  ],
  glsl: /* glsl */ `
float patternHeight(vec2 uv) {
  float s = max(1.0, floor(u_scale + 0.5));
  int oct = int(max(1.0, floor(u_octaves + 0.5)));

  vec2 q = uv;
  if (u_warp > 0.001) {
    float wf = max(1.0, floor(u_warpFreq + 0.5));
    vec2 w = vec2(
      fbm(uv * wf, wf, u_seed + 11.0, 3),
      fbm(uv * wf, wf, u_seed + 23.0, 3)
    );
    q += (w - 0.5) * u_warp;
  }

  float soft = fbm(q * s, s, u_seed, oct);
  float ridge = fbmRidged(q * s, s, u_seed, oct);
  float h = mix(soft, ridge, u_ridged);

  if (u_waves > 0.001) {
    float wc = max(1.0, floor(u_waveCount + 0.5));
    float a = 0.5 - 0.5 * cos(dot(q, stripeDir(wc, u_waveAngle)) * 2.0 * PI);
    float b = 0.5 - 0.5 * cos(dot(q, stripeDir(wc, u_waveAngle + 63.0)) * 2.0 * PI);
    h = mix(h, (a + b) * 0.5, u_waves);
  }
  return h;
}
`,
};
