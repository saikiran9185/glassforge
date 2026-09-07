import { Pattern, p } from "./types";

/**
 * Voronoi shards. Each cell is shaded as a *tilted plane* (via the vector back
 * to its feature point) rather than a cone, so every shard displaces the image
 * in one consistent direction — which is what real broken glass does.
 */
export const shatter: Pattern = {
  id: "shatter",
  name: "Cracked / shattered",
  blurb: "Voronoi shards with beveled crack lines. Facet tilts each shard into its own little prism.",
  params: [
    p("cells", "Shard count", 2, 48, 1, 9),
    p("jitter", "Irregularity", 0, 1, 0.01, 0.85),
    p("facet", "Facet tilt", 0, 1.5, 0.01, 0.7, "Each shard becomes a sloped plane"),
    p("edge", "Crack width", 0.005, 0.4, 0.005, 0.06),
    p("depth", "Crack depth", 0, 1, 0.01, 0.55),
    p("variation", "Height variation", 0, 1, 0.01, 0.35),
    p("radial", "Radial burst", 0, 1, 0.01, 0, "Pull shards toward an impact point"),
  ],
  glsl: /* glsl */ `
float patternHeight(vec2 uv) {
  float n = max(2.0, floor(u_cells + 0.5));

  // Radial burst warps cell density toward the centre — impact-point look.
  vec2 q = uv;
  if (u_radial > 0.001) {
    vec2 c = uv - 0.5;
    float r = length(c) * 2.0;
    q = 0.5 + c * mix(1.0, 0.35 + r * r, u_radial);
  }

  float d1, d2, cid;
  vec2 rel;
  voronoi(q * n, n, u_seed, u_jitter, d1, d2, rel, cid);

  float inside = smoothstep(0.0, u_edge, d2 - d1);   // 0 on the crack, 1 inside a shard
  float ang = cid * 2.0 * PI;
  float facet = dot(rel, vec2(cos(ang), sin(ang))) * u_facet;
  float base = mix(0.5, cid, u_variation);

  return mix(base - u_depth, base + facet, inside);
}
`,
};
