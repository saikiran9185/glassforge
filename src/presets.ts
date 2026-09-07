import { State, defaultObject, defaultState } from "./state";

export interface Preset {
  name: string;
  apply: (base: State) => State;
}

/** Small helper so a preset only has to name what it changes. */
function make(
  name: string,
  patternId: string,
  params: Record<string, number>,
  height: Partial<State["height"]> = {}
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
      };
    },
  };
}

export const PRESETS: Preset[] = [
  // The tutorial's texture: a hard black-to-transparent ramp, repeated.
  make("Reeded", "ribbed", { count: 30, angle: 0, profile: 0.15, cross: 0, waviness: 0 }, { blur: 2 }),
  make("Fluted", "ribbed", { count: 13, angle: 0, profile: 1.7, cross: 0 }, { blur: 6 }),
  make("Cross-hatch", "ribbed", { count: 44, profile: 0.9, cross: 1 }, { blur: 3 }),
  make("Wavy ribs", "ribbed", { count: 22, profile: 1.2, waviness: 0.45, waveFreq: 4 }, { blur: 4 }),
  make("Fine reed", "ribbed", { count: 96, profile: 0.6, cross: 0 }, { blur: 1 }),
  make("Frosted", "noise", { scale: 16, octaves: 5, ridged: 0, warp: 0.15 }, { blur: 3, contrast: 1.4 }),
  make(
    "Antique wave",
    "noise",
    { scale: 4, octaves: 3, warp: 0.45, warpFreq: 2, waves: 0.8, waveCount: 7, waveAngle: 24 },
    { blur: 5 }
  ),
  make("Crumpled", "noise", { scale: 8, octaves: 6, ridged: 0.85, warp: 0.3 }, { blur: 1.5, contrast: 1.3 }),
  make(
    "Shattered",
    "shatter",
    { cells: 11, jitter: 0.9, facet: 0.8, edge: 0.05, depth: 0.6, variation: 0.4 },
    { blur: 1 }
  ),
  make(
    "Prism shards",
    "shatter",
    { cells: 6, jitter: 1, facet: 1.3, edge: 0.02, depth: 0.2, variation: 0.7, radial: 0.4 },
    { blur: 0.5 }
  ),
  make(
    "Rain",
    "rain",
    { density: 16, size: 0.85, coverage: 0.55, stretch: 1.3, trail: 0.25, softness: 0.2, mist: 0.2 },
    { blur: 1.5 }
  ),
  make(
    "Running water",
    "rain",
    { density: 10, size: 0.7, coverage: 0.7, stretch: 2.6, trail: 0.75, softness: 0.5, mist: 0.35 },
    { blur: 3 }
  ),
];

/** Starting points for the glass-object mode. */
export interface ObjectPreset {
  name: string;
  apply: (base: State) => State;
}

function obj(
  name: string,
  patch: Partial<State["object"]>,
  patternId?: string
): ObjectPreset {
  return {
    name,
    apply: (base) => ({
      ...base,
      patternId: patternId ?? base.patternId,
      object: { ...defaultObject(), ...patch },
    }),
  };
}

export const OBJECT_PRESETS: ObjectPreset[] = [
  obj("Liquid pill", {
    shape: 2, sizeX: 0.28, sizeY: 0.11, edge: 0.032, profile: 1,
    refract: 2.7, disperse: 0.45, frost: 0.28, spec: 0.7, specWidth: 0.4,
    innerGlow: 0.8, shadow: 0.4, tintAmt: 0.06,
  }),
  obj("Figma card", {
    shape: 0, sizeX: 0.3, sizeY: 0.2, radius: 0.05, edge: 0.028, profile: 1.5,
    refract: 1.9, disperse: 0.25, frost: 0.6, spec: 0.4, specWidth: 0.25,
    innerGlow: 0.5, shadow: 0.45, tintAmt: 0.12, tintColor: "#e8f1ff",
  }),
  obj("Glass text", {
    shape: 3, maskSource: "text", text: "glass", fontSize: 0.3, fontWeight: 800,
    letterSpacing: -0.03, edge: 0.05, profile: 0.6,
    refract: 3.4, disperse: 0.7, frost: 0.18, spec: 0.9, specWidth: 0.45,
    innerGlow: 1.4, shadow: 0.3,
  }),
  obj("Bubble", {
    shape: 1, sizeX: 0.22, sizeY: 0.22, edge: 0.22, profile: 0,
    refract: 2.6, disperse: 1.2, frost: 0.05, spec: 1.1, specWidth: 0.3,
    innerGlow: 0.9, shadow: 0.25, tintAmt: 0.05,
  }),
  obj(
    "Fluted lens",
    {
      shape: 1, sizeX: 0.25, sizeY: 0.25, edge: 0.1, profile: 1.1,
      patternAmt: 0.35, patternScale: 3,
      refract: 2.3, disperse: 0.4, frost: 0.2, spec: 0.6, innerGlow: 0.6, shadow: 0.35,
    },
    "ribbed"
  ),
  obj("Frosted panel", {
    shape: 0, sizeX: 0.34, sizeY: 0.26, radius: 0.03, edge: 0.018, profile: 1.7,
    refract: 1.3, disperse: 0.12, frost: 0.95, spec: 0.28, specWidth: 0.2,
    innerGlow: 0.35, shadow: 0.5, tintAmt: 0.16, tintColor: "#f2f7ff",
  }),
  obj("Heavy prism", {
    shape: 0, sizeX: 0.26, sizeY: 0.26, radius: 0.02, edge: 0.14, profile: 0.35,
    refract: 4.6, disperse: 1.7, frost: 0, spec: 1, specWidth: 0.5,
    innerGlow: 1.2, shadow: 0.3, tintAmt: 0,
  }),
];
