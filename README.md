# GlassForge

Procedural **glass and refraction texture generator** that runs entirely in the browser.

Build a tileable height map from a handful of sliders, watch the refraction happen
live on your own image, then export the texture as **PNG** or **PSD** — or skip
Photoshop and export the finished render.

Nothing is uploaded. Every pixel is generated on your GPU.

## Why

Photoshop's `Filter → Distort → Glass` reads a PSD's **luminance as a height map**
and pushes pixels along its slope. The usual way to feed it is to hand-build a
texture: duplicate a black-to-transparent gradient thirty times, rasterise,
rotate, save, load, tweak, save again. That loop is slow and none of it is
parametric — change your mind about the rib count and you start over.

GlassForge makes the texture a set of sliders, and since the same height map can
drive a fragment shader, it also shows you the result immediately.

## Features

- **Four pattern families**, all seamlessly tileable
  - **Ribbed / fluted** — reeded glass. Band count, angle, sawtooth→sine→lens profile, cross-hatch, waviness
  - **Cracked / shattered** — Voronoi shards with beveled crack lines; each shard is a tilted plane, so it refracts like a real prism rather than a bubble
  - **Rain / droplets** — lens-profile beads with stretch, trails and mist
  - **Noise & waves** — fbm, ridged fbm, domain warp and sine interference for frosted, molten and antique glass
- **Live WebGL2 refraction** on any image you drop, paste or open — with chromatic dispersion, frosted scattering, a specular bevel and tint
- **Region masking** — apply the glass to the whole frame, a split, a circle or a rectangle, and drag it around on the canvas
- **Exports** — height map as PNG or **8-bit grayscale PSD** (what Photoshop's Glass filter wants), or the refracted image as PNG, up to 4096²
- **10 presets** covering the common looks, plus a seed for reproducible randomness
- Settings persist in `localStorage`; double-click any slider to reset it

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # static files in dist/
npm run preview
```

Requires **WebGL2**, which means any current Chrome, Edge, Firefox or Safari.

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`
(enable Pages → Source: GitHub Actions in the repo settings first).

## Using the PSD in Photoshop

1. Pick a pattern, tune it, hit **↓ Texture PSD**.
2. In Photoshop, select your layer and **Convert to Smart Object** — this keeps the filter re-editable.
3. **Filter → Distort → Glass**, set Texture to **Load Texture…**, choose the PSD.
4. Tune *Distortion*, *Smoothness* and *Scaling*. Double-click the Filter Gallery entry in the Layers panel to swap the texture later.

The PSD is written flat, 8-bit, single-channel grayscale — the Glass filter only
reads luminance, and it refuses anything that isn't a PSD.

## How it works

Five GPU passes, re-run only when something changes:

| Pass | What it does |
|------|--------------|
| **Height** | Runs the selected pattern's `patternHeight(uv)` into a half-float target, then applies contrast / bias / invert |
| **Blur** ×2 | Separable Gaussian. Softening the height map is the difference between etched and rolled glass |
| **Gradient** | Stores the map's slope, mipmapped to 1×1 to get its *mean* steepness |
| **Glass** | Central-differences the height, divides by that mean slope, and offsets the image UV along it — plus per-channel dispersion, Poisson-disc frosting and a specular bevel from the height normal |

That mean-slope division is the part worth stealing: without it, "Distortion"
silently tracks pattern frequency, so a 120-band texture obliterates the image at
the same setting where a 6-band one barely bends it. Normalising makes the slider
a displacement amount — the way Photoshop's is.

## Adding a pattern

One file, then one line. Patterns are just a GLSL function plus a param schema —
the UI, uniforms, presets and export all read from that.

```ts
// src/patterns/hex.ts
import { Pattern, p } from "./types";

export const hex: Pattern = {
  id: "hex",
  name: "Hex bevel",
  blurb: "Honeycomb glass block.",
  params: [p("cells", "Cell count", 2, 40, 1, 10)],
  glsl: `
float patternHeight(vec2 uv) {
  // every param is in scope as u_<key>; u_seed too
  return /* 0..1 */;
}
`,
};
```

Then add it to `PATTERNS` in `src/patterns/registry.ts`. That's the whole change.

**Keep it tileable:** pass the same integer frequency you multiply `uv` by as the
`period` argument of `hash21p` / `hash22p` / `vnoise` / `fbm` / `voronoi`, and take
stripe directions from `stripeDir()`, which rounds them to integer vectors so
angled stripes still wrap. Helpers live in `src/patterns/common.glsl.ts`.

## Layout

```
src/
  patterns/     pattern definitions + the shared GLSL prelude
  gl/           context, programs, render targets, shader sources, renderer
  ui/           tiny DOM helpers, generated controls, placeholder image
  export/       PNG encoder (canvas) and PSD writer (hand-rolled)
  state.ts      app state, defaults, persistence
  presets.ts    named starting points
```

## License

MIT
