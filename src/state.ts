import { PATTERNS } from "./patterns/registry";

export interface State {
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
    patternId: PATTERNS[0].id,
    seed: 1,
    textureSize: 1024,
    repeat: 1,
    guides: true,
    params,
    height: { blur: 1.5, contrast: 1, brightness: 0, invert: 0 },
  };
}

const KEY = "glassforge.state.v2";

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
