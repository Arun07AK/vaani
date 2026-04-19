import type { HandshapeName } from "./handshapes";
import type { SignComposition } from "./signCompose";

/**
 * One-handed ISL fingerspelling alphabet — A through Z mapped to handshapes
 * and a default location (hand held in front of the chest). ISL has both
 * one-handed and two-handed alphabets; one-handed is used for loan words /
 * proper nouns. This approximates the one-handed ISL set, substituting
 * where a distinct handshape isn't yet in our library.
 *
 * Not a linguistically exact implementation — the handshapes are the closest
 * matches from our 18-handshape library. Good-enough fallback so unknown
 * words produce visibly distinct letter-by-letter motion instead of
 * collapsing to "rest pose."
 */

const LETTER_TO_HANDSHAPE: Record<string, HandshapeName> = {
  A: "FIST",
  B: "FLAT_5",
  C: "C",
  D: "POINT_INDEX",
  E: "CLAW",
  F: "BABY_O",
  G: "L",
  H: "V",
  I: "Y",           // approximation (pinky extended)
  J: "Y",
  K: "V",
  L: "L",
  M: "BUNCHED",
  N: "BENT_5",
  O: "O",
  P: "POINT_INDEX",
  Q: "HOOK_INDEX",
  R: "V",
  S: "FIST",
  T: "BUNCHED",
  U: "V",
  V: "V",
  W: "W",
  X: "HOOK_INDEX",
  Y: "Y",
  Z: "POINT_INDEX",
};

/** Render a word as a sequence of per-letter sign compositions. */
export function fingerspellWord(word: string): SignComposition[] {
  const letters = word.toUpperCase().replace(/[^A-Z]/g, "").split("");
  return letters.map((letter) => {
    const handshape = LETTER_TO_HANDSHAPE[letter] ?? "FLAT_5";
    const comp: SignComposition = {
      handshape,
      palm: "PALM_OUT",
      location: "NEUTRAL_FORWARD",
      movement: "HOLD",
      durationMs: 350,
      source: `fingerspelled '${letter}'`,
    };
    return comp;
  });
}

/** Cheap check — does the word contain at least one spellable letter, and only
 *  letters + common separators (hyphens, underscores, whitespace)? Separators
 *  are stripped by fingerspellWord before rendering. */
export function canFingerspell(word: string): boolean {
  return /[A-Za-z]/.test(word) && /^[A-Za-z\-_\s]+$/.test(word);
}
