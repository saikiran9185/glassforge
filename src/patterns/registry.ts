import { Pattern } from "./types";
import { ribbed } from "./ribbed";
import { shatter } from "./shatter";
import { rain } from "./rain";
import { noise } from "./noise";

/**
 * Add a pattern by writing one file next to these and appending it here.
 * Nothing else needs to change — the UI, uniforms and export all read this list.
 */
export const PATTERNS: Pattern[] = [ribbed, shatter, rain, noise];

export const patternById = (id: string): Pattern =>
  PATTERNS.find((x) => x.id === id) ?? PATTERNS[0];
