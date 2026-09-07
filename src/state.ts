import { PATTERNS } from "./patterns/registry";

export type RevealMode = 0 | 1 | 2 | 3; // all | split | circle | rect

export interface State {
  patternId: string;
  seed: number;
  textureSize: number;
  /** Per-pattern param values, so switching patterns doesn't lose your settings. */
  params: Record<string, Record<string, number>>;
  height: {
    blur: number;
    contrast: number;
    brightness: number;
    invert: number;
  };
  glass: {
    scale: number;
    rotate: number;
    offsetX: number;
    offsetY: number;
    distort: number;
    chroma: number;
    frost: number;
    spec: number;
    relief: number;
    lightAngle: number;
    tint: number;
    tintColor: string;
  };
  reveal: {
    mode: RevealMode;
    x: number;
    y: number;
    size: number;
    feather: number;
    angle: number;
  };
}

export function defaultState(): State {
  const params: State["params"] = {};
  for (const pat of PATTERNS) {
    params[pat.id] = Object.fromEntries(pat.params.map((x) => [x.key, x.value]));
  }
  return {
    patternId: PATTERNS[0].id,
    seed: 1,
    textureSize: 1024,
    params,
    height: { blur: 1.5, contrast: 1, brightness: 0, invert: 0 },
    glass: {
      scale: 1,
      rotate: 0,
      offsetX: 0,
      offsetY: 0,
      distort: 1.6,
      chroma: 0.35,
      frost: 0.2,
      spec: 0.35,
      relief: 0.5,
      lightAngle: 135,
      tint: 0,
      tintColor: "#bfe4ff",
    },
    reveal: { mode: 0, x: 0.5, y: 0.5, size: 0.25, feather: 0.004, angle: 0 },
  };
}

const KEY = "glassforge.state.v1";

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
      glass: { ...base.glass, ...saved.glass },
      reveal: { ...base.reveal, ...saved.reveal },
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
