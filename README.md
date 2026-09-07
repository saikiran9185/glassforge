# GlassForge

### → [saikiran9185.github.io/glassforge](https://saikiran9185.github.io/glassforge/)

Two tools in one browser tab. No install, no sign-in, no upload.

**Texture** makes the black-and-white height map that Photoshop's
`Filter → Distort → Glass` loads — parametric, seamlessly tileable, exported as
the PSD that filter insists on. It is not a Photoshop replacement; it replaces
the *tedious part* of making the texture.

**Glass object** puts a piece of glass on top of an image — liquid-glass pills,
Figma-style frosted cards, glass type, lenses and bubbles — rendered live in
WebGL2 and exported as PNG.

![GlassForge generating a reeded-glass height map](docs/screenshot.png)

![A glass bubble refracting a backdrop](docs/glass-object.png)

## Why

The Glass filter reads a PSD's **luminance as a height map** and pushes pixels
along its slope. The usual way to feed it is to build that texture by hand:
duplicate a black-to-transparent gradient thirty times, rasterise, unlink the
mask, rotate, group, save as PSD, load it, decide the ribs are too fine, and do
the whole thing again.

None of that is parametric, and none of it is reusable. Here the texture is a set
of sliders and a seed — change the rib count, re-export, done.

## Features

### Texture — height maps for Photoshop

- **Four pattern families**, all seamlessly tileable
  - **Ribbed / fluted** — reeded glass. Band count, angle, a sawtooth→sine→lens profile morph, cross-hatch, waviness, taper
  - **Cracked / shattered** — Voronoi shards with beveled crack lines; each shard is a tilted plane, so it displaces in one consistent direction like a real prism instead of radially like a bubble
  - **Rain / droplets** — lens-profile beads with stretch, tapering runs and mist
  - **Noise & waves** — fbm, ridged fbm, domain warp and sine interference, for frosted, crumpled and antique glass
- **Height-map controls that map to what the filter does** — Softness (hard edge → sharp displacement, ramp → smooth bend), Contrast (height range, so displacement distance), Bias, Invert
- **Seam check** — draw the tile 2×2 or 3×3 with boundary guides

  ![2×2 seam check](docs/seam-check.png)

- **PSD export** — flat 8-bit single-channel grayscale, up to 4096², which is exactly what the Glass filter accepts. PNG too, for Blender displacement / AE Displacement Map / TouchDesigner
- **12 presets** and a seed for reproducible randomness
- Settings persist in `localStorage`; double-click any slider to reset it

### Glass object — liquid glass, Figma glass, glass type

![Glass type over a backdrop](docs/glass-text.png)

- **Shapes**: rounded rect, circle, pill, or a mask from **text you type** or **an image you drop** (its transparency, or its brightness for flat files)
- **Text**: any font installed on your machine, weight, size, letter spacing, multi-line
- **Body**: rim width and a thickness profile that runs dome → flat-top-with-bevel → thin sheet. Narrow rim reads as a sheet of glass; wide rim reads as a fat bead
- **Material**: refraction, dispersion, backdrop frost, specular highlight with light angle and spread, bevel, rim glow, tint, and a soft drop shadow
- **Surface texture**: blend any Texture-tab pattern onto the object — fluted pills, hammered panels
- **Backdrop**: drop, paste or open any image; drag on the canvas to move the glass
- **7 presets**: Liquid pill · Figma card · Glass text · Bubble · Fluted lens · Frosted panel · Heavy prism
- Exports PNG at the backdrop's own resolution

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # static files in dist/
npm run preview
```

Requires **WebGL2** — any current Chrome, Edge, Firefox or Safari.

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`
(enable Pages → Source: GitHub Actions in the repo settings first).

## Using it in Photoshop

1. Tune a pattern, pick an export size, hit **↓ Texture PSD**.
2. In Photoshop, select your layer → **Convert to Smart Object** (keeps the filter re-editable).
3. **Filter → Distort → Glass**.
4. **Texture → Load Texture…** → the exported PSD.
5. Tune *Distortion*, *Smoothness* and *Scaling*.

Later, double-click **Filter Gallery** in the Layers panel to retune or swap the
texture without redoing anything.

Exports are square because the tiles are seamless — the Glass filter repeats one
across any document size, and its own *Scaling* slider handles apparent scale.

## How it works

**Texture mode** — three GPU passes, re-run only when something changes:

| Pass | What it does |
|------|--------------|
| **Height** | Runs the selected pattern's `patternHeight(uv)` into a half-float target, then contrast / bias / invert |
| **Blur** ×2 | Separable Gaussian — the Softness control |
| **View** | Grayscale blit, optionally tiled with seam guides. Export takes the same blit at repeat 1 into a byte target and reads it back |

Half-float intermediates matter: an 8-bit height map bands visibly, and the Glass
filter turns each band step into a displacement edge.

**Glass-object mode** — thickness → shadow blur → downsampled backdrop blur →
lens composite.

Liquid glass, Figma's glass material and glass type are the same effect: a
*shape with thickness* over a backdrop. Thickness is near-flat through the middle
and falls off at the rim, so refraction concentrates at the edge — that edge
lensing plus a specular rim is what reads as glass rather than as a blurred
rectangle. Analytic shapes get an exact SDF; text and images arrive as a mask
pair (crisp alpha for coverage, CPU-blurred alpha as the thickness ramp), so
every shape shares one code path.

Two details worth stealing:

- **Displacement is normalised by rim width.** The raw thickness gradient scales as `1/edge`, so a narrow rim would bend *further* than a wide one — backwards, and violent enough to alias into rainbow noise. Multiplying the gradient by the rim width makes it O(1) steepness, and the displacement becomes a fraction of the rim itself.
- **Strong refraction prefilters itself.** Where the lens pushes hardest it is compressing the most backdrop into each pixel, so the shader leans on a pre-blurred copy in proportion to the displacement. That kills the sampling noise and matches how a real edge softens what it squeezes.

The PSD writer (`src/export/psd.ts`, ~40 lines, no dependencies) emits header →
empty colour-mode/resources/layer sections → raw image data. Single channel,
8-bit, colour mode 1.

## Adding a pattern

One file, then one line. A pattern is a GLSL function plus a param schema — the
UI, uniforms, presets and export all read from that.

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
angled stripes still wrap. Helpers live in `src/patterns/common.glsl.ts`. Check
your work with the 2×2 preview.

## Layout

```
src/
  patterns/     pattern definitions + the shared GLSL prelude
  glass/        SDF + lens shaders, text/image mask builder, default backdrop
  gl/           context, programs, render targets, shader sources, renderer
  ui/           tiny DOM helpers and generated controls
  export/       PNG encoder (canvas) and PSD writer (hand-rolled)
  state.ts      app state, defaults, persistence
  presets.ts    named starting points
```

## License

MIT
