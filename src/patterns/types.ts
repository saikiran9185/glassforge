/** A single tweakable knob. The UI and the shader uniforms are both generated from this. */
export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Shown under the slider when the meaning isn't obvious. */
  hint?: string;
}

/**
 * A height-map generator.
 *
 * `glsl` must define:
 *   float patternHeight(vec2 uv)
 * returning roughly 0..1. `uv` is 0..1 across the tile. Every param in `params`
 * is available as `uniform float u_<key>`, alongside `u_seed`.
 *
 * Keep it tileable: pass the same integer frequency you multiply `uv` by as the
 * `period` argument of the hash/noise/voronoi helpers, and take stripe
 * directions from `stripeDir()`. That is what lets the preview repeat the
 * texture without seams.
 */
export interface Pattern {
  id: string;
  name: string;
  blurb: string;
  params: ParamDef[];
  glsl: string;
}

export const p = (
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  hint?: string
): ParamDef => ({ key, label, min, max, step, value, hint });
