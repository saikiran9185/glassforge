import "./style.css";
import { GLError } from "./gl/core";
import { Renderer } from "./gl/renderer";
import { PATTERNS, patternById } from "./patterns/registry";
import { PRESETS } from "./presets";
import { State, defaultState, loadState, saveState, RevealMode } from "./state";
import { downloadPNG } from "./export/png";
import { downloadPSD } from "./export/psd";
import { stamp } from "./export/download";
import { button, checkbox, colorInput, section, select, slider } from "./ui/controls";
import { clear, el } from "./ui/dom";
import { makePlaceholder } from "./ui/placeholder";

type View = "result" | "texture";

const root = document.querySelector<HTMLDivElement>("#app")!;
let state: State = loadState();
let view: View = "result";
let imageName = "placeholder";

// ---------------------------------------------------------------- layout ----
const canvas = el("canvas", { class: "stage-canvas" });
const stage = el("main", { class: "stage" }, [canvas]);
const railHost = el("aside", { class: "rail" });
const paramHost = el("aside", { class: "params" });
const statusBar = el("span", { class: "status" });
const viewTabs = el("div", { class: "tabs" });
const footer = el("footer", { class: "footer" });

root.append(
  el("header", { class: "topbar" }, [
    el("div", { class: "brand" }, [
      el("span", { class: "brand-mark", text: "◧" }),
      el("span", { class: "brand-name", text: "GlassForge" }),
    ]),
    viewTabs,
    el("div", { class: "topbar-actions" }, [
      button("Open image…", pickImage),
      button("Reset image", usePlaceholder, "ghost"),
    ]),
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
      el("p", { text: "Try a current Chrome, Edge, Firefox or Safari on a machine with hardware acceleration enabled." }),
    ])
  );
  throw err;
}

// ------------------------------------------------------------- rendering ----
let rafId = 0;
let saveTimer = 0;

function requestRender(): void {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    draw();
  });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveState(state), 400);
}

function sizeCanvas(): void {
  const rect = stage.getBoundingClientRect();
  const img = renderer.imageSize;
  const aspect = view === "texture" ? 1 : img.width / Math.max(1, img.height);
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

function draw(): void {
  try {
    sizeCanvas();
    renderer.render(state, view);
    setStatus("");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true);
  }
}

function setStatus(message: string, isError = false): void {
  statusBar.textContent = message;
  statusBar.classList.toggle("status-error", isError && message !== "");
}

// ----------------------------------------------------------------- image ----
function useImage(source: TexImageSource, width: number, height: number, name: string): void {
  renderer.setImage(source, width, height);
  imageName = name;
  requestRender();
}

function usePlaceholder(): void {
  const c = makePlaceholder();
  useImage(c, c.width, c.height, "placeholder");
}

async function loadFile(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) {
    setStatus(`${file.name} is not an image.`, true);
    return;
  }
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    useImage(bitmap, bitmap.width, bitmap.height, file.name.replace(/\.[^.]+$/, ""));
  } catch (err) {
    setStatus(`Could not read ${file.name}: ${err instanceof Error ? err.message : err}`, true);
  }
}

function pickImage(): void {
  const input = el("input", { type: "file", accept: "image/*" });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void loadFile(file);
  });
  input.click();
}

window.addEventListener("dragover", (e) => {
  e.preventDefault();
  stage.classList.add("dropping");
});
window.addEventListener("dragleave", () => stage.classList.remove("dropping"));
window.addEventListener("drop", (e) => {
  e.preventDefault();
  stage.classList.remove("dropping");
  const file = e.dataTransfer?.files?.[0];
  if (file) void loadFile(file);
});
window.addEventListener("paste", (e) => {
  const file = Array.from(e.clipboardData?.files ?? [])[0];
  if (file) void loadFile(file);
});

// ------------------------------------------------------- canvas dragging ----
// Drag moves the reveal shape when one is active, otherwise it pans the texture.
let dragging: { uvX: number; uvY: number; offX: number; offY: number } | null = null;

function pointerUV(e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
}

canvas.addEventListener("pointerdown", (e) => {
  const uv = pointerUV(e);
  canvas.setPointerCapture(e.pointerId);
  if (state.reveal.mode !== 0 && view === "result") {
    state.reveal.x = uv.x;
    state.reveal.y = uv.y;
    dragging = { uvX: uv.x, uvY: uv.y, offX: 0, offY: 0 };
  } else {
    dragging = { uvX: uv.x, uvY: uv.y, offX: state.glass.offsetX, offY: state.glass.offsetY };
  }
  requestRender();
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const uv = pointerUV(e);
  if (state.reveal.mode !== 0 && view === "result") {
    state.reveal.x = uv.x;
    state.reveal.y = uv.y;
  } else {
    const img = renderer.imageSize;
    const aspect = img.width / Math.max(1, img.height);
    state.glass.offsetX = dragging.offX - (uv.x - dragging.uvX) * state.glass.scale * aspect;
    state.glass.offsetY = dragging.offY - (uv.y - dragging.uvY) * state.glass.scale;
  }
  requestRender();
});

const endDrag = (): void => {
  dragging = null;
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// -------------------------------------------------------------- left rail ----
function buildRail(): void {
  clear(railHost);

  const patternList = PATTERNS.map((pattern) =>
    el(
      "button",
      {
        class: `pattern ${pattern.id === state.patternId ? "is-active" : ""}`,
        type: "button",
        onclick: () => {
          state.patternId = pattern.id;
          buildRail();
          buildParams();
          requestRender();
        },
      },
      [
        el("span", { class: "pattern-name", text: pattern.name }),
        el("span", { class: "pattern-blurb", text: pattern.blurb }),
      ]
    )
  );

  const presetList = PRESETS.map((preset) =>
    button(preset.name, () => {
      state = preset.apply(state);
      buildRail();
      buildParams();
      requestRender();
    }, "chip")
  );

  railHost.append(
    section("Pattern", patternList),
    section("Presets", [el("div", { class: "chips" }, presetList)])
  );
}

// ------------------------------------------------------------ right panel ----
function buildParams(): void {
  clear(paramHost);
  const pattern = patternById(state.patternId);
  const values = state.params[pattern.id] ?? (state.params[pattern.id] = {});

  const patternControls = pattern.params.map((def) =>
    slider({
      label: def.label,
      min: def.min,
      max: def.max,
      step: def.step,
      value: values[def.key] ?? def.value,
      hint: def.hint,
      onInput: (v) => {
        values[def.key] = v;
        requestRender();
      },
    })
  );

  const h = state.height;
  const heightControls = [
    slider({ label: "Softness", min: 0, max: 24, step: 0.1, value: h.blur, hint: "Blurs the height map — the difference between etched and rolled glass", onInput: (v) => { h.blur = v; requestRender(); } }),
    slider({ label: "Contrast", min: 0.1, max: 4, step: 0.01, value: h.contrast, onInput: (v) => { h.contrast = v; requestRender(); } }),
    slider({ label: "Bias", min: -0.5, max: 0.5, step: 0.01, value: h.brightness, onInput: (v) => { h.brightness = v; requestRender(); } }),
    checkbox("Invert", h.invert > 0.5, (v) => { h.invert = v ? 1 : 0; requestRender(); }),
    select({
      label: "Texture size",
      value: state.textureSize,
      options: [512, 1024, 2048, 4096].map((n) => ({ value: n, label: `${n} × ${n}` })),
      onChange: (v) => { state.textureSize = v; requestRender(); },
    }),
  ];

  const g = state.glass;
  const glassControls = [
    slider({ label: "Distortion", min: 0, max: 14, step: 0.05, value: g.distort, onInput: (v) => { g.distort = v; requestRender(); } }),
    slider({ label: "Dispersion", min: 0, max: 3, step: 0.01, value: g.chroma, hint: "Splits R/G/B — the colour fringing real glass has", onInput: (v) => { g.chroma = v; requestRender(); } }),
    slider({ label: "Frost", min: 0, max: 1, step: 0.01, value: g.frost, onInput: (v) => { g.frost = v; requestRender(); } }),
    slider({ label: "Bevel", min: 0, max: 1.5, step: 0.01, value: g.relief, onInput: (v) => { g.relief = v; requestRender(); } }),
    slider({ label: "Highlight", min: 0, max: 2, step: 0.01, value: g.spec, onInput: (v) => { g.spec = v; requestRender(); } }),
    slider({ label: "Light angle", min: 0, max: 360, step: 1, value: g.lightAngle, onInput: (v) => { g.lightAngle = v; requestRender(); } }),
    slider({ label: "Texture scale", min: 0.1, max: 6, step: 0.01, value: g.scale, hint: "Drag the canvas to pan the texture", onInput: (v) => { g.scale = v; requestRender(); } }),
    slider({ label: "Texture rotation", min: -180, max: 180, step: 1, value: g.rotate, onInput: (v) => { g.rotate = v; requestRender(); } }),
    slider({ label: "Tint", min: 0, max: 1, step: 0.01, value: g.tint, onInput: (v) => { g.tint = v; requestRender(); } }),
    colorInput("Tint colour", g.tintColor, (v) => { g.tintColor = v; requestRender(); }),
  ];

  const rv = state.reveal;
  const revealControls = [
    select({
      label: "Region",
      value: rv.mode,
      options: [
        { value: 0 as RevealMode, label: "Whole image" },
        { value: 1 as RevealMode, label: "Split" },
        { value: 2 as RevealMode, label: "Circle" },
        { value: 3 as RevealMode, label: "Rectangle" },
      ],
      onChange: (v) => { rv.mode = v; buildParams(); requestRender(); },
    }),
    ...(rv.mode === 0
      ? []
      : [
          ...(rv.mode === 1 ? [] : [slider({ label: "Size", min: 0.02, max: 1.2, step: 0.005, value: rv.size, onInput: (v) => { rv.size = v; requestRender(); } })]),
          slider({ label: "Feather", min: 0.0005, max: 0.4, step: 0.0005, value: rv.feather, onInput: (v) => { rv.feather = v; requestRender(); } }),
          slider({ label: "Angle", min: -180, max: 180, step: 1, value: rv.angle, onInput: (v) => { rv.angle = v; requestRender(); } }),
          el("p", { class: "note", text: "Drag on the canvas to move the region." }),
        ]),
  ];

  const seedControls = [
    slider({ label: "Seed", min: 1, max: 999, step: 1, value: state.seed, onInput: (v) => { state.seed = v; requestRender(); } }),
    el("div", { class: "row" }, [
      button("Randomise", () => { state.seed = 1 + Math.floor(Math.random() * 999); buildParams(); requestRender(); }, "wide"),
      button("Reset all", () => {
        state = defaultState();
        buildRail();
        buildParams();
        requestRender();
      }, "wide ghost"),
    ]),
  ];

  paramHost.append(
    section(pattern.name, patternControls),
    section("Height map", heightControls),
    section("Glass", glassControls),
    section("Region", revealControls),
    section("Seed", seedControls)
  );
}

// ---------------------------------------------------------------- footer ----
function buildTabs(): void {
  clear(viewTabs);
  for (const [id, label] of [["result", "Result"], ["texture", "Texture"]] as const) {
    viewTabs.append(
      el("button", {
        class: `tab ${view === id ? "is-active" : ""}`,
        type: "button",
        text: label,
        onclick: () => {
          view = id;
          buildTabs();
          requestRender();
        },
      })
    );
  }
}

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
  const exportSizeWrap = el("span", { class: "footer-size" });
  let exportSize = state.textureSize;
  exportSizeWrap.append(
    select({
      label: "Export size",
      value: exportSize,
      options: [512, 1024, 2048, 4096].map((n) => ({ value: n, label: `${n} px` })),
      onChange: (v) => { exportSize = v; },
    })
  );

  footer.append(
    exportSizeWrap,
    el("div", { class: "footer-actions" }, [
      button("↓ Texture PNG", () =>
        void withStatus("Rendering texture…", async () => {
          const px = renderer.readTexture(state, exportSize);
          await downloadPNG(px, `glassforge-${state.patternId}-${stamp()}.png`);
          draw();
        })
      ),
      button("↓ Texture PSD", () =>
        void withStatus("Writing PSD…", () => {
          const px = renderer.readTexture(state, exportSize);
          downloadPSD(px, `glassforge-${state.patternId}-${stamp()}.psd`);
          draw();
        })
      ),
      button("↓ Result PNG", () =>
        void withStatus("Rendering result…", async () => {
          const px = renderer.readResult(state);
          await downloadPNG(px, `${imageName}-glass-${stamp()}.png`);
          draw();
        }),
        "primary"
      ),
    ]),
    statusBar
  );
}

// ------------------------------------------------------------------ boot ----
buildTabs();
buildRail();
buildParams();
buildFooter();
usePlaceholder();

new ResizeObserver(() => requestRender()).observe(stage);
