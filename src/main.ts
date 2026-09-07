import "./style.css";
import { GLError } from "./gl/core";
import { Renderer } from "./gl/renderer";
import { PATTERNS, patternById } from "./patterns/registry";
import { OBJECT_PRESETS, PRESETS } from "./presets";
import { Mode, ShapeId, State, defaultState, loadState, saveState } from "./state";
import { makeBackdrop } from "./glass/backdrop";
import { MaskPair, buildImageMask, buildTextMask } from "./glass/mask";
import { downloadPNG } from "./export/png";
import { downloadPSD } from "./export/psd";
import { button, checkbox, colorInput, section, select, slider, textArea, textInput } from "./ui/controls";
import { clear, el } from "./ui/dom";

const root = document.querySelector<HTMLDivElement>("#app")!;
let state: State = loadState();

const FONTS: { value: string; label: string }[] = [
  { value: 'ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", sans-serif', label: "System sans" },
  { value: '"Helvetica Neue", Helvetica, Arial, sans-serif', label: "Grotesk" },
  { value: 'Georgia, "Times New Roman", serif', label: "Serif" },
  { value: 'Didot, "Bodoni MT", Georgia, serif', label: "Didone" },
  { value: 'ui-monospace, "SF Mono", Menlo, monospace', label: "Mono" },
  { value: 'Impact, Haettenschweiler, "Arial Black", sans-serif', label: "Heavy" },
];

// ---------------------------------------------------------------- layout ----
const canvas = el("canvas", { class: "stage-canvas" });
const stage = el("main", { class: "stage" }, [canvas]);
const railHost = el("aside", { class: "rail" });
const paramHost = el("aside", { class: "params" });
const statusBar = el("span", { class: "status" });
const modeTabs = el("div", { class: "tabs" });
const topRight = el("div", { class: "top-right" });
const footer = el("footer", { class: "footer" });

root.append(
  el("header", { class: "topbar" }, [
    el("div", { class: "brand" }, [
      el("span", { class: "brand-mark", text: "◧" }),
      el("span", { class: "brand-name", text: "GlassForge" }),
    ]),
    modeTabs,
    topRight,
  ]),
  railHost,
  stage,
  paramHost,
  footer
);

let renderer: Renderer;
try {
  renderer = new Renderer(canvas);
} catch (err) {
  root.replaceChildren(
    el("div", { class: "fatal" }, [
      el("h1", { text: "WebGL2 is required" }),
      el("p", { text: err instanceof GLError ? err.message : String(err) }),
      el("p", { text: "Try a current Chrome, Edge, Firefox or Safari with hardware acceleration enabled." }),
    ])
  );
  throw err;
}

// ------------------------------------------------------------- rendering ----
let rafId = 0;
let saveTimer = 0;
let backdropName = "backdrop";
let shapeImage: { source: CanvasImageSource; width: number; height: number } | null = null;
let maskSignature = "";

function requestRender(): void {
  if (!rafId) {
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      draw();
    });
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveState(state), 400);
}

function sizeCanvas(): void {
  const rect = stage.getBoundingClientRect();
  const bd = renderer.backdropSize;
  const aspect = state.mode === "object" ? bd.width / Math.max(1, bd.height) : 1;
  const availW = Math.max(64, rect.width - 40);
  const availH = Math.max(64, rect.height - 40);
  let w = availW;
  let h = w / aspect;
  if (h > availH) {
    h = availH;
    w = h * aspect;
  }
  canvas.style.width = `${Math.round(w)}px`;
  canvas.style.height = `${Math.round(h)}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.resizeCanvas(Math.max(1, Math.round(w * dpr)), Math.max(1, Math.round(h * dpr)));
}

/**
 * Text and image masks are rasterised on the CPU, so they are rebuilt only when
 * a parameter that actually affects them changes — not on every slider move.
 */
function syncMask(): void {
  const o = state.object;
  if (state.mode !== "object" || o.shape !== 3) return;
  const bd = renderer.backdropSize;
  const aspect = bd.width / Math.max(1, bd.height);
  const height = Math.min(1400, Math.max(512, Math.round(1400 / Math.max(aspect, 1))));
  const width = Math.round(height * aspect);

  const sig = [
    o.maskSource, o.maskChannel, o.text, o.fontFamily, o.fontWeight, o.fontSize,
    o.letterSpacing, o.imageScale, o.centerX, o.centerY, o.rotation, o.edge,
    width, height, shapeImage ? "img" : "none",
  ].join("|");
  if (sig === maskSignature) return;
  maskSignature = sig;

  let pair: MaskPair;
  if (o.maskSource === "image" && shapeImage) {
    pair = buildImageMask({
      width, height,
      source: shapeImage.source,
      sourceWidth: shapeImage.width,
      sourceHeight: shapeImage.height,
      channel: o.maskChannel,
      scale: o.imageScale,
      centerX: o.centerX, centerY: o.centerY, rotation: o.rotation, edge: o.edge,
    });
  } else {
    pair = buildTextMask({
      width, height,
      text: o.text || " ",
      fontFamily: o.fontFamily,
      fontWeight: o.fontWeight,
      fontSize: o.fontSize,
      letterSpacing: o.letterSpacing,
      centerX: o.centerX, centerY: o.centerY, rotation: o.rotation, edge: o.edge,
    });
  }
  renderer.setMask(pair);
}

function draw(): void {
  try {
    sizeCanvas();
    if (state.mode === "object") {
      syncMask();
      renderer.renderObject(state);
    } else {
      renderer.render(state);
    }
    setStatus("");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true);
  }
}

function setStatus(message: string, isError = false): void {
  statusBar.textContent = message;
  statusBar.classList.toggle("status-error", isError && message !== "");
}

function rebuildAll(): void {
  buildModeTabs();
  buildTopRight();
  buildRail();
  buildParams();
  buildFooter();
  requestRender();
}

// ----------------------------------------------------------------- images ----
function useBackdrop(source: TexImageSource, width: number, height: number, name: string): void {
  renderer.setBackdrop(source, width, height);
  backdropName = name;
  maskSignature = ""; // aspect may have changed, so the mask has to be redrawn
  requestRender();
}

function useDefaultBackdrop(): void {
  const c = makeBackdrop();
  useBackdrop(c, c.width, c.height, "backdrop");
}

async function readImage(file: File): Promise<ImageBitmap | null> {
  if (!file.type.startsWith("image/")) {
    setStatus(`${file.name} is not an image.`, true);
    return null;
  }
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (err) {
    setStatus(`Could not read ${file.name}: ${err instanceof Error ? err.message : err}`, true);
    return null;
  }
}

async function loadBackdropFile(file: File): Promise<void> {
  const bmp = await readImage(file);
  if (bmp) useBackdrop(bmp, bmp.width, bmp.height, file.name.replace(/\.[^.]+$/, ""));
}

async function loadShapeFile(file: File): Promise<void> {
  const bmp = await readImage(file);
  if (!bmp) return;
  shapeImage = { source: bmp, width: bmp.width, height: bmp.height };
  state.object.shape = 3;
  state.object.maskSource = "image";
  maskSignature = "";
  rebuildAll();
}

function pickFile(onFile: (f: File) => void): void {
  const input = el("input", { type: "file", accept: "image/*" });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) onFile(file);
  });
  input.click();
}

window.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (state.mode === "object") stage.classList.add("dropping");
});
window.addEventListener("dragleave", () => stage.classList.remove("dropping"));
window.addEventListener("drop", (e) => {
  e.preventDefault();
  stage.classList.remove("dropping");
  const file = e.dataTransfer?.files?.[0];
  if (file && state.mode === "object") void loadBackdropFile(file);
});
window.addEventListener("paste", (e) => {
  const file = Array.from(e.clipboardData?.files ?? [])[0];
  if (file && state.mode === "object") void loadBackdropFile(file);
});

// ------------------------------------------------------- canvas dragging ----
let dragging = false;
canvas.addEventListener("pointerdown", (e) => {
  if (state.mode !== "object") return;
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
  moveObject(e);
});
canvas.addEventListener("pointermove", (e) => {
  if (dragging) moveObject(e);
});
const endDrag = (): void => { dragging = false; };
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

function moveObject(e: PointerEvent): void {
  const r = canvas.getBoundingClientRect();
  state.object.centerX = (e.clientX - r.left) / r.width;
  state.object.centerY = 1 - (e.clientY - r.top) / r.height;
  requestRender();
}

// ------------------------------------------------------------ top of app ----
function buildModeTabs(): void {
  clear(modeTabs);
  for (const [id, label] of [["texture", "Texture"], ["object", "Glass object"]] as const) {
    modeTabs.append(
      el("button", {
        class: `tab ${state.mode === id ? "is-active" : ""}`,
        type: "button",
        text: label,
        onclick: () => {
          state.mode = id as Mode;
          rebuildAll();
        },
      })
    );
  }
}

function buildTopRight(): void {
  clear(topRight);
  if (state.mode === "texture") {
    topRight.append(el("span", { class: "tile-label", text: "Preview" }));
    for (const n of [1, 2, 3]) {
      topRight.append(
        el("button", {
          class: `tab ${state.repeat === n ? "is-active" : ""}`,
          type: "button",
          text: n === 1 ? "1 tile" : `${n}×${n}`,
          title: n === 1 ? "The exported tile" : "Repeat the tile to check the seams",
          onclick: () => { state.repeat = n; buildTopRight(); requestRender(); },
        })
      );
    }
    topRight.append(
      el("label", { class: "tile-guides" }, [
        el("input", {
          type: "checkbox",
          checked: state.guides,
          onchange: (e: Event) => { state.guides = (e.target as HTMLInputElement).checked; requestRender(); },
        }),
        el("span", { text: "Seams" }),
      ])
    );
  } else {
    topRight.append(
      button("Backdrop…", () => pickFile((f) => void loadBackdropFile(f))),
      button("Reset backdrop", useDefaultBackdrop, "ghost")
    );
  }
}

// -------------------------------------------------------------- left rail ----
function buildRail(): void {
  clear(railHost);

  if (state.mode === "texture") {
    const patternList = PATTERNS.map((pattern) =>
      el("button", {
        class: `pattern ${pattern.id === state.patternId ? "is-active" : ""}`,
        type: "button",
        onclick: () => { state.patternId = pattern.id; buildRail(); buildParams(); requestRender(); },
      }, [
        el("span", { class: "pattern-name", text: pattern.name }),
        el("span", { class: "pattern-blurb", text: pattern.blurb }),
      ])
    );

    const presetList = PRESETS.map((preset) =>
      button(preset.name, () => { state = preset.apply(state); buildRail(); buildParams(); requestRender(); }, "chip")
    );

    const steps = [
      "Export the PSD.",
      "In Photoshop, select your layer → Convert to Smart Object.",
      "Filter → Distort → Glass.",
      "Texture → Load Texture… → pick the PSD.",
      "Tune Distortion, Smoothness and Scaling.",
    ].map((t) => el("li", { text: t }));

    railHost.append(
      section("Pattern", patternList),
      section("Presets", [el("div", { class: "chips" }, presetList)]),
      section("In Photoshop", [
        el("ol", { class: "steps" }, steps),
        el("p", {
          class: "note",
          text: "The Glass filter reads only luminance and only accepts a PSD. Tiles are seamless, so Photoshop can repeat one across any document size.",
        }),
      ])
    );
    return;
  }

  const shapes: { id: ShapeId; name: string; blurb: string }[] = [
    { id: 0, name: "Rounded rect", blurb: "Cards, panels, buttons. Radius and size are yours." },
    { id: 1, name: "Circle", blurb: "Lenses, bubbles, badges." },
    { id: 2, name: "Pill", blurb: "The liquid-glass capsule." },
    { id: 3, name: "Text or image", blurb: "Type a word, or drop a PNG and use its alpha as the shape." },
  ];

  const shapeList = shapes.map((sh) =>
    el("button", {
      class: `pattern ${state.object.shape === sh.id ? "is-active" : ""}`,
      type: "button",
      onclick: () => { state.object.shape = sh.id; buildRail(); buildParams(); requestRender(); },
    }, [
      el("span", { class: "pattern-name", text: sh.name }),
      el("span", { class: "pattern-blurb", text: sh.blurb }),
    ])
  );

  const presetList = OBJECT_PRESETS.map((preset) =>
    button(preset.name, () => {
      state = preset.apply(state);
      maskSignature = "";
      buildRail(); buildParams(); requestRender();
    }, "chip")
  );

  railHost.append(
    section("Shape", shapeList),
    section("Presets", [el("div", { class: "chips" }, presetList)]),
    section("Backdrop", [
      el("p", { class: "note", text: "Drop an image anywhere, paste one, or use Backdrop… above. Drag on the canvas to move the glass." }),
    ])
  );
}

// ------------------------------------------------------------ right panel ----
function buildTextureParams(): void {
  const pattern = patternById(state.patternId);
  const values = state.params[pattern.id] ?? (state.params[pattern.id] = {});

  const patternControls = pattern.params.map((def) =>
    slider({
      label: def.label, min: def.min, max: def.max, step: def.step,
      value: values[def.key] ?? def.value, hint: def.hint,
      onInput: (v) => { values[def.key] = v; requestRender(); },
    })
  );

  const h = state.height;
  const mapControls = [
    slider({ label: "Softness", min: 0, max: 24, step: 0.1, value: h.blur,
      hint: "Blurs the map. Hard edges become sharp displacement, ramps become smooth bends — etched vs. rolled glass.",
      onInput: (v) => { h.blur = v; requestRender(); } }),
    slider({ label: "Contrast", min: 0.1, max: 4, step: 0.01, value: h.contrast,
      hint: "Height range, so how far the Glass filter pushes pixels",
      onInput: (v) => { h.contrast = v; requestRender(); } }),
    slider({ label: "Bias", min: -0.5, max: 0.5, step: 0.01, value: h.brightness, onInput: (v) => { h.brightness = v; requestRender(); } }),
    checkbox("Invert", h.invert > 0.5, (v) => { h.invert = v ? 1 : 0; requestRender(); }),
    select({ label: "Preview quality", value: state.textureSize,
      options: [512, 1024, 2048].map((n) => ({ value: n, label: `${n} px` })),
      onChange: (v) => { state.textureSize = v; requestRender(); } }),
  ];

  paramHost.append(
    section(pattern.name, patternControls),
    section("Height map", mapControls),
    section("Seed", seedControls())
  );
}

function seedControls(): HTMLElement[] {
  return [
    slider({ label: "Seed", min: 1, max: 999, step: 1, value: state.seed, onInput: (v) => { state.seed = v; requestRender(); } }),
    el("div", { class: "row" }, [
      button("Randomise", () => { state.seed = 1 + Math.floor(Math.random() * 999); buildParams(); requestRender(); }, "wide"),
      button("Reset all", () => { state = defaultState(); maskSignature = ""; rebuildAll(); }, "wide ghost"),
    ]),
  ];
}

function buildObjectParams(): void {
  const o = state.object;
  const bump = (v: number) => { void v; maskSignature = ""; };

  const shapeControls: HTMLElement[] = [];
  if (o.shape === 3) {
    shapeControls.push(
      select({
        label: "Source", value: o.maskSource,
        options: [{ value: "text" as const, label: "Text" }, { value: "image" as const, label: "Image" }],
        onChange: (v) => { o.maskSource = v; bump(0); buildParams(); requestRender(); },
      })
    );
    if (o.maskSource === "text") {
      shapeControls.push(
        textArea("Text", o.text, (v) => { o.text = v; bump(0); requestRender(); }),
        select({ label: "Font", value: FONTS.find((f) => f.value === o.fontFamily)?.value ?? FONTS[0].value,
          options: FONTS, onChange: (v) => { o.fontFamily = v; bump(0); buildParams(); requestRender(); } }),
        textInput("Font family", o.fontFamily, (v) => { o.fontFamily = v; bump(0); requestRender(); }, "any font installed on your machine"),
        slider({ label: "Weight", min: 100, max: 900, step: 100, value: o.fontWeight, onInput: (v) => { o.fontWeight = v; bump(0); requestRender(); } }),
        slider({ label: "Size", min: 0.04, max: 0.8, step: 0.005, value: o.fontSize, onInput: (v) => { o.fontSize = v; bump(0); requestRender(); } }),
        slider({ label: "Letter spacing", min: -0.15, max: 0.5, step: 0.005, value: o.letterSpacing, onInput: (v) => { o.letterSpacing = v; bump(0); requestRender(); } })
      );
    } else {
      shapeControls.push(
        button("Shape image…", () => pickFile((f) => void loadShapeFile(f)), "wide"),
        select({ label: "Read shape from", value: o.maskChannel,
          options: [{ value: "alpha" as const, label: "Transparency" }, { value: "luma" as const, label: "Brightness" }],
          onChange: (v) => { o.maskChannel = v; bump(0); requestRender(); } }),
        slider({ label: "Scale", min: 0.05, max: 2, step: 0.01, value: o.imageScale, onInput: (v) => { o.imageScale = v; bump(0); requestRender(); } }),
        el("p", { class: "note", text: shapeImage ? "" : "No shape image loaded yet — pick a PNG with transparency, or switch to Brightness for a flat image." })
      );
    }
  } else {
    shapeControls.push(
      slider({ label: "Width", min: 0.02, max: 0.6, step: 0.005, value: o.sizeX, onInput: (v) => { o.sizeX = v; requestRender(); } }),
      slider({ label: "Height", min: 0.02, max: 0.6, step: 0.005, value: o.sizeY, onInput: (v) => { o.sizeY = v; requestRender(); } })
    );
    if (o.shape === 0) {
      shapeControls.push(slider({ label: "Corner radius", min: 0, max: 0.3, step: 0.002, value: o.radius, onInput: (v) => { o.radius = v; requestRender(); } }));
    }
  }
  shapeControls.push(
    slider({ label: "Rotation", min: -180, max: 180, step: 1, value: o.rotation, onInput: (v) => { o.rotation = v; bump(0); requestRender(); } }),
    el("p", { class: "note", text: "Drag on the canvas to reposition." })
  );

  const bodyControls = [
    slider({ label: "Edge width", min: 0.004, max: 0.35, step: 0.002, value: o.edge,
      hint: "How far in from the rim the glass reaches full thickness. Narrow reads as a thin sheet, wide as a fat bead.",
      onInput: (v) => { o.edge = v; bump(0); requestRender(); } }),
    slider({ label: "Profile", min: 0, max: 2, step: 0.01, value: o.profile,
      hint: "Dome → flat top with a beveled rim → thin sheet",
      onInput: (v) => { o.profile = v; requestRender(); } }),
    slider({ label: "Surface texture", min: 0, max: 1, step: 0.01, value: o.patternAmt,
      hint: "Blends the Texture tab's pattern onto the glass — fluted pills, hammered panels",
      onInput: (v) => { o.patternAmt = v; requestRender(); } }),
    slider({ label: "Texture scale", min: 0.25, max: 12, step: 0.05, value: o.patternScale, onInput: (v) => { o.patternScale = v; requestRender(); } }),
  ];

  const materialControls = [
    slider({ label: "Refraction", min: 0, max: 6, step: 0.01, value: o.refract, hint: "Displacement, measured in rim widths", onInput: (v) => { o.refract = v; requestRender(); } }),
    slider({ label: "Dispersion", min: 0, max: 3, step: 0.01, value: o.disperse, hint: "Per-channel split — the colour fringe at the rim", onInput: (v) => { o.disperse = v; requestRender(); } }),
    slider({ label: "Frost", min: 0, max: 1, step: 0.01, value: o.frost, hint: "Backdrop blur seen through the glass", onInput: (v) => { o.frost = v; requestRender(); } }),
    slider({ label: "Highlight", min: 0, max: 2, step: 0.01, value: o.spec, onInput: (v) => { o.spec = v; requestRender(); } }),
    slider({ label: "Highlight spread", min: 0, max: 1, step: 0.01, value: o.specWidth, onInput: (v) => { o.specWidth = v; requestRender(); } }),
    slider({ label: "Light angle", min: 0, max: 360, step: 1, value: o.light, onInput: (v) => { o.light = v; requestRender(); } }),
    slider({ label: "Bevel", min: 0, max: 3, step: 0.01, value: o.bump, onInput: (v) => { o.bump = v; requestRender(); } }),
    slider({ label: "Rim glow", min: 0, max: 3, step: 0.01, value: o.innerGlow, onInput: (v) => { o.innerGlow = v; requestRender(); } }),
    slider({ label: "Tint", min: 0, max: 1, step: 0.01, value: o.tintAmt, onInput: (v) => { o.tintAmt = v; requestRender(); } }),
    colorInput("Tint colour", o.tintColor, (v) => { o.tintColor = v; requestRender(); }),
  ];

  const shadowControls = [
    slider({ label: "Shadow", min: 0, max: 1, step: 0.01, value: o.shadow, onInput: (v) => { o.shadow = v; requestRender(); } }),
    slider({ label: "Offset X", min: -0.08, max: 0.08, step: 0.001, value: o.shadowX, onInput: (v) => { o.shadowX = v; requestRender(); } }),
    slider({ label: "Offset Y", min: -0.08, max: 0.08, step: 0.001, value: o.shadowY, onInput: (v) => { o.shadowY = v; requestRender(); } }),
  ];

  paramHost.append(
    section("Shape", shapeControls),
    section("Body", bodyControls),
    section("Material", materialControls),
    section("Shadow", shadowControls),
    section("Seed", seedControls())
  );
}

function buildParams(): void {
  clear(paramHost);
  if (state.mode === "texture") buildTextureParams();
  else buildObjectParams();
}

// ---------------------------------------------------------------- footer ----
async function withStatus(message: string, fn: () => void | Promise<void>): Promise<void> {
  setStatus(message);
  try {
    await fn();
    setStatus("");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true);
  }
}

function buildFooter(): void {
  clear(footer);

  if (state.mode === "object") {
    footer.append(
      el("span", { class: "footer-note", text: "Exports at the backdrop’s own resolution." }),
      el("div", { class: "footer-actions" }, [
        button("↓ PNG", () =>
          void withStatus("Rendering…", async () => {
            const px = renderer.readObject(state);
            await downloadPNG(px, `${backdropName}-glass.png`);
            draw();
          }), "primary"),
      ]),
      statusBar
    );
    return;
  }

  let exportSize = 2048;
  footer.append(
    el("span", { class: "footer-size" }, [
      select({
        label: "Export size", value: exportSize,
        options: [512, 1024, 2048, 4096].map((n) => ({ value: n, label: `${n} × ${n}` })),
        onChange: (v) => { exportSize = v; },
      }),
    ]),
    el("div", { class: "footer-actions" }, [
      button("↓ PNG", () =>
        void withStatus("Rendering…", async () => {
          const px = renderer.readTexture(state, exportSize);
          await downloadPNG(px, `glass-${state.patternId}-${exportSize}.png`);
          draw();
        }), "ghost"),
      button("↓ Texture PSD", () =>
        void withStatus("Writing PSD…", () => {
          const px = renderer.readTexture(state, exportSize);
          downloadPSD(px, `glass-${state.patternId}-${exportSize}.psd`);
          draw();
        }), "primary"),
    ]),
    statusBar
  );
}

// ------------------------------------------------------------------ boot ----
useDefaultBackdrop();
rebuildAll();

new ResizeObserver(() => requestRender()).observe(stage);
