import { State, defaultState } from "./state";

export interface Preset {
  name: string;
  apply: (base: State) => State;
}

/** Small helper so a preset only has to name what it changes. */
function make(
  name: string,
  patternId: string,
  params: Record<string, number>,
  height: Partial<State["height"]> = {},
  glass: Partial<State["glass"]> = {}
): Preset {
  return {
    name,
    apply: (base) => {
      const d = defaultState();
      return {
        ...base,
        patternId,
        params: { ...base.params, [patternId]: { ...d.params[patternId], ...params } },
        height: { ...d.height, ...height },
        glass: { ...d.glass, ...glass },
      };
    },
  };
}

export const PRESETS: Preset[] = [
  make(
    "Reeded",
    "ribbed",
    { count: 30, angle: 0, profile: 0.15, cross: 0, waviness: 0 },
    { blur: 2 },
    { distort: 3.0, chroma: 0.3, frost: 0.05, spec: 0.4, relief: 0.5 }
  ),
  make(
    "Fluted",
    "ribbed",
    { count: 13, angle: 0, profile: 1.7, cross: 0 },
    { blur: 6 },
    { distort: 4.5, chroma: 0.5, frost: 0.1, spec: 0.55, relief: 0.7 }
  ),
  make(
    "Cross-hatch",
    "ribbed",
    { count: 44, profile: 0.9, cross: 1 },
    { blur: 3 },
    { distort: 5.5, chroma: 0.4, frost: 0.15 }
  ),
  make(
    "Wavy ribs",
    "ribbed",
    { count: 22, profile: 1.2, waviness: 0.45, waveFreq: 4 },
    { blur: 4 },
    { distort: 4.0, chroma: 0.45 }
  ),
  make(
    "Frosted",
    "noise",
    { scale: 16, octaves: 5, ridged: 0, warp: 0.15 },
    { blur: 3, contrast: 1.4 },
    { distort: 1.6, chroma: 0.15, frost: 0.85, spec: 0.2, relief: 0.35 }
  ),
  make(
    "Antique wave",
    "noise",
    { scale: 4, octaves: 3, warp: 0.45, warpFreq: 2, waves: 0.8, waveCount: 7, waveAngle: 24 },
    { blur: 5 },
    { distort: 6.0, chroma: 0.5, frost: 0.1, spec: 0.4, relief: 0.6 }
  ),
  make(
    "Shattered",
    "shatter",
    { cells: 11, jitter: 0.9, facet: 0.8, edge: 0.05, depth: 0.6, variation: 0.4 },
    { blur: 1 },
    { distort: 3.4, chroma: 0.6, frost: 0.05, spec: 0.7, relief: 0.8 }
  ),
  make(
    "Prism shards",
    "shatter",
    { cells: 6, jitter: 1, facet: 1.3, edge: 0.02, depth: 0.2, variation: 0.7, radial: 0.4 },
    { blur: 0.5 },
    { distort: 5.5, chroma: 1.4, frost: 0, spec: 0.9, relief: 0.9 }
  ),
  make(
    "Rain",
    "rain",
    { density: 16, size: 0.85, coverage: 0.55, stretch: 1.3, trail: 0.25, softness: 0.2, mist: 0.2 },
    { blur: 1.5 },
    { distort: 6.5, chroma: 0.4, frost: 0.35, spec: 0.8, relief: 0.7 }
  ),
  make(
    "Running water",
    "rain",
    { density: 10, size: 0.7, coverage: 0.7, stretch: 2.6, trail: 0.75, softness: 0.5, mist: 0.35 },
    { blur: 3 },
    { distort: 8.0, chroma: 0.35, frost: 0.5, spec: 0.6, relief: 0.6 }
  ),
];
