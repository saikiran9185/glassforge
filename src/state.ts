import { PATTERNS } from "./patterns/registry";

/** "texture" makes tileable height maps; "object" puts a glass shape on a backdrop. */
export type Mode = "texture" | "object";

/** 0 rounded rect · 1 circle · 2 pill · 3 mask (text or an uploaded image) */
export type ShapeId = 0 | 1 | 2 | 3;

export interface ObjectState {
  shape: ShapeId;
  maskSource: "text" | "image";
  maskChannel: "alpha" | "luma";
  text: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  letterSpacing: number;
  imageScale: number;

  centerX: number;
  centerY: number;
  rotation: number;
  sizeX: number;
  sizeY: number;
  radius: number;

  edge: number;
  profile: number;
  patternAmt: number;
  patternScale: number;

  refract: number;
  disperse: number;
  frost: number;
  tintAmt: number;
  tintColor: string;
  spec: number;
  specWidth: number;
  light: number;
  bump: number;
  innerGlow: number;
  shadow: number;
  shadowX: number;
  shadowY: number;
}

export interface State {
  mode: Mode;
  object: ObjectState;
  patternId: string;
  seed: number;
  /** Preview resolution. Export size is chosen separately at export time. */
  textureSize: number;
  /** How many times the tile is drawn across the preview — for checking seams. */
  repeat: number;
  guides: boolean;
  /** Per-pattern param values, so switching patterns doesn't lose your settings. */
  params: Record<string, Record<string, number>>;
  height: {
    blur: number;
    contrast: number;
    brightness: number;
    invert: number;
  };
}

export function defaultState(): State {
  const params: State["params"] = {};
  for (const pat of PATTERNS) {
    params[pat.id] = Object.fromEntries(pat.params.map((x) => [x.key, x.value]));
  }
  return {
    mode: "texture",
    object: defaultObject(),
    patternId: PATTERNS[0].id,
    seed: 1,
    textureSize: 1024,
    repeat: 1,
    guides: true,
    params,
    height: { blur: 1.5, contrast: 1, brightness: 0, invert: 0 },
  };
}

export function defaultObject(): ObjectState {
  return {
    shape: 0,
    maskSource: "text",
    maskChannel: "alpha",
    text: "glass",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", sans-serif',
    fontWeight: 700,
    fontSize: 0.28,
    letterSpacing: -0.02,
    imageScale: 0.7,

    centerX: 0.5,
    centerY: 0.5,
    rotation: 0,
    sizeX: 0.3,
    sizeY: 0.16,
    radius: 0.09,

    edge: 0.042,
    profile: 1,
    patternAmt: 0,
    patternScale: 3,

    refract: 2.4,
    disperse: 0.35,
    frost: 0.25,
    tintAmt: 0.08,
    tintColor: "#cfe6ff",
    spec: 0.55,
    specWidth: 0.35,
    light: 125,
    bump: 1,
    innerGlow: 0.5,
    shadow: 0.35,
    shadowX: 0.004,
    shadowY: -0.012,
  };
}

const KEY = "glassforge.state.v3";

export function saveState(state: State): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private browsing / storage disabled — the app still works, it just won't remember */
  }
}

/** Merges the stored state over the defaults so new params added later still appear. */
export function loadState(): State {
  const base = defaultState();
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return base;
  }
  if (!raw) return base;
  try {
    const saved = JSON.parse(raw) as Partial<State>;
    return {
      ...base,
      ...saved,
      params: mergeParams(base.params, saved.params),
      height: { ...base.height, ...saved.height },
      object: { ...base.object, ...saved.object },
    };
  } catch {
    return base;
  }
}

function mergeParams(
  base: State["params"],
  saved: State["params"] | undefined
): State["params"] {
  if (!saved) return base;
  const out: State["params"] = {};
  for (const id of Object.keys(base)) out[id] = { ...base[id], ...saved[id] };
  return out;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
