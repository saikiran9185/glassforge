import "./style.css";
import { GLError } from "./gl/core";
import { Renderer } from "./gl/renderer";
import { PATTERNS, patternById } from "./patterns/registry";
import { PRESETS } from "./presets";
import { State, defaultState, loadState, saveState } from "./state";
import { downloadPNG } from "./export/png";
import { downloadPSD } from "./export/psd";
import { button, checkbox, section, select, slider } from "./ui/controls";
import { clear, el } from "./ui/dom";

const root = document.querySelector<HTMLDivElement>("#app")!;
let state: State = loadState();

// ---------------------------------------------------------------- layout ----
const canvas = el("canvas", { class: "stage-canvas" });
const stage = el("main", { class: "stage" }, [canvas]);
const railHost = el("aside", { class: "rail" });
const paramHost = el("aside", { class: "params" });
const statusBar = el("span", { class: "status" });
const tileControls = el("div", { class: "tile-controls" });
const footer = el("footer", { class: "footer" });

root.append(
  el("header", { class: "topbar" }, [
    el("div", { class: "brand" }, [
      el("span", { class: "brand-mark", text: "◧" }),
      el("span", { class: "brand-name", text: "GlassForge" }),
      el("span", { class: "brand-sub", text: "height maps for Photoshop’s Glass filter" }),
    ]),
    tileControls,
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
  const side = Math.max(64, Math.min(rect.width - 40, rect.height - 40));
  canvas.style.width = `${Math.round(side)}px`;
  canvas.style.height = `${Math.round(side)}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.max(1, Math.round(side * dpr));
  renderer.resizeCanvas(px, px);
}

function draw(): void {
  try {
    sizeCanvas();
    renderer.render(state);
    setStatus("");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true);
  }
}

function setStatus(message: string, isError = false): void {
  statusBar.textContent = message;
  statusBar.classList.toggle("status-error", isError && message !== "");
}

// -------------------------------------------------------- tile / seam UI ----
function buildTileControls(): void {
  clear(tileControls);
  tileControls.append(el("span", { class: "tile-label", text: "Preview" }));
  for (const n of [1, 2, 3]) {
    tileControls.append(
      el("button", {
        class: `tab ${state.repeat === n ? "is-active" : ""}`,
        type: "button",
        text: n === 1 ? "1 tile" : `${n}×${n}`,
        title: n === 1 ? "The exported tile" : "Repeat the tile to check the seams",
        onclick: () => {
          state.repeat = n;
          buildTileControls();
          requestRender();
        },
      })
    );
  }
  tileControls.append(
    el("label", { class: "tile-guides" }, [
      el("input", {
        type: "checkbox",
        checked: state.guides,
        onchange: (e: Event) => {
          state.guides = (e.target as HTMLInputElement).checked;
          requestRender();
        },
      }),
      el("span", { text: "Seams" }),
    ])
  );
}

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
    button(
      preset.name,
      () => {
        state = preset.apply(state);
        buildRail();
        buildParams();
        requestRender();
      },
      "chip"
    )
  );

  const steps = [
    "Export the PSD.",
    "In Photoshop, select your layer → Convert to Smart Object.",
    "Filter → Distort → Glass.",
    "Texture → Load Texture… → pick the PSD.",
    "Tune Distortion, Smoothness and Scaling.",
  ].map((t, i) => el("li", { text: t, value: String(i + 1) }));

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
  const mapControls = [
    slider({
      label: "Softness",
      min: 0,
      max: 24,
      step: 0.1,
      value: h.blur,
      hint: "Blurs the map. Hard edges become sharp displacement, ramps become smooth bends — etched vs. rolled glass.",
      onInput: (v) => { h.blur = v; requestRender(); },
    }),
    slider({
      label: "Contrast",
      min: 0.1,
      max: 4,
      step: 0.01,
      value: h.contrast,
      hint: "Height range, so how far the Glass filter pushes pixels",
      onInput: (v) => { h.contrast = v; requestRender(); },
    }),
    slider({ label: "Bias", min: -0.5, max: 0.5, step: 0.01, value: h.brightness, onInput: (v) => { h.brightness = v; requestRender(); } }),
    checkbox("Invert", h.invert > 0.5, (v) => { h.invert = v ? 1 : 0; requestRender(); }),
    select({
      label: "Preview quality",
      value: state.textureSize,
      options: [512, 1024, 2048].map((n) => ({ value: n, label: `${n} px` })),
      onChange: (v) => { state.textureSize = v; requestRender(); },
    }),
  ];

  const seedControls = [
    slider({ label: "Seed", min: 1, max: 999, step: 1, value: state.seed, onInput: (v) => { state.seed = v; requestRender(); } }),
    el("div", { class: "row" }, [
      button("Randomise", () => { state.seed = 1 + Math.floor(Math.random() * 999); buildParams(); requestRender(); }, "wide"),
      button("Reset all", () => { state = defaultState(); buildRail(); buildTileControls(); buildParams(); requestRender(); }, "wide ghost"),
    ]),
  ];

  paramHost.append(
    section(pattern.name, patternControls),
    section("Height map", mapControls),
    section("Seed", seedControls)
  );
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
  let exportSize = 2048;

  footer.append(
    el("span", { class: "footer-size" }, [
      select({
        label: "Export size",
        value: exportSize,
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
        }),
        "ghost"
      ),
      button("↓ Texture PSD", () =>
        void withStatus("Writing PSD…", () => {
          const px = renderer.readTexture(state, exportSize);
          downloadPSD(px, `glass-${state.patternId}-${exportSize}.psd`);
          draw();
        }),
        "primary"
      ),
    ]),
    statusBar
  );
}

// ------------------------------------------------------------------ boot ----
buildTileControls();
buildRail();
buildParams();
buildFooter();
requestRender();

new ResizeObserver(() => requestRender()).observe(stage);
