import { Pattern, p } from "./types";

/**
 * The tutorial's texture, parameterised: a stack of gradient bands.
 * `profile` walks from a hard sawtooth ramp (what you get by duplicating a
 * black->transparent gradient) through a soft sine to a rounded lens ridge.
 */
export const ribbed: Pattern = {
  id: "ribbed",
  name: "Ribbed / fluted",
  blurb: "Parallel gradient bands — reeded and fluted glass. Add Cross for the tutorial's grid.",
  params: [
    p("count", "Band count", 2, 160, 1, 28),
    p("angle", "Angle", 0, 180, 1, 0, "Snapped slightly so the tile stays seamless"),
    p("profile", "Profile", 0, 2, 0.01, 0.9, "Sawtooth → sine → lens"),
    p("cross", "Cross", 0, 1, 0.01, 0, "Blend in a perpendicular set of bands"),
    p("waviness", "Waviness", 0, 1, 0.01, 0),
    p("waveFreq", "Wave scale", 1, 16, 1, 3),
    p("taper", "Taper", 0, 1, 0.01, 0, "Fade band height across the tile"),
  ],
  glsl: /* glsl */ `
float patternHeight(vec2 uv) {
  float wf = max(1.0, floor(u_waveFreq + 0.5));
  float wobble = (fbm(uv * wf, wf, u_seed, 3) - 0.5) * u_waviness;

  vec2 dirA = stripeDir(u_count, u_angle);
  float hA = ridgeProfile(fract(dot(uv, dirA) + wobble), u_profile);

  vec2 dirB = stripeDir(u_count, u_angle + 90.0);
  float hB = ridgeProfile(fract(dot(uv, dirB) + wobble), u_profile);

  float h = mix(hA, (hA + hB) * 0.5, u_cross);

  // Taper reads along the band normal, so it thins the ribs rather than the image.
  float t = fract(dot(uv, normalize(dirA + 1e-6)) * 0.5);
  h = mix(h, h * (0.25 + 0.75 * (0.5 - 0.5 * cos(t * 2.0 * PI))), u_taper);
  return h;
}
`,
};
