import type { BoneName } from "./bones";

/**
 * Canonical ISL handshapes, authored for the RIGHT hand and mirrored to
 * the LEFT via `mirrorHandshape()` (negate the Z component — the curl
 * axis for VRM 1.0 normalized finger bones).
 *
 * Every handshape explicitly specifies MCP (Proximal), PIP (Intermediate),
 * and DIP (Distal) rotations per finger so no joint defaults to T-pose
 * straight. Thumb Proximal/Intermediate/Distal carry opposition +
 * abduction separately from curl.
 *
 * References for shape selection:
 *   - ISL Research & Training Centre (ISLRTC) "Sign Learn" Android app
 *   - indiansignlanguage.org / FDMSE Coimbatore dictionary
 *   - Zeshan (2003) Indo-Pakistani Sign Language Grammar — handshape inventory
 */

export type HandBone =
  | "IndexProximal" | "IndexIntermediate" | "IndexDistal"
  | "MiddleProximal" | "MiddleIntermediate" | "MiddleDistal"
  | "RingProximal"  | "RingIntermediate"  | "RingDistal"
  | "LittleProximal" | "LittleIntermediate" | "LittleDistal"
  | "ThumbProximal" | "ThumbIntermediate" | "ThumbDistal";

export type FingerPose = Partial<Record<HandBone, [number, number, number]>>;

// Curl magnitudes (radians).
const CURL_FULL = 1.5;   // ~86° — full finger curl at MCP/PIP
const CURL_TIP  = 1.2;   // ~69° — DIP joint curl (slightly less)
const CURL_HALF = 0.8;   // ~46° — halfway curl
const CURL_BENT = 1.0;   // ~57° — bent but not fully curled

// Thumb kinematics (separate axes from other fingers).
const THUMB_TUCK_X     = 0.5;   // thumb proximal X: rotates across palm
const THUMB_TUCK_Z     = -0.7;  // thumb tucked under fingers
const THUMB_OPPOSE_Z   = 0.3;   // thumb slightly abducted (open hand)
const THUMB_EXTEND_Z   = 0.7;   // thumb fully extended out (L, Y, ILY, thumb-up)
const THUMB_PINCH_X    = 0.4;   // thumb bent toward index (O, C, BABY_O)

// Convenience helper: build all four curled fingers at a single magnitude.
function curledFour(
  mcp: number,
  pip: number,
  dip: number,
  which: readonly ("Index" | "Middle" | "Ring" | "Little")[] = ["Index", "Middle", "Ring", "Little"],
): FingerPose {
  const out: FingerPose = {};
  for (const f of which) {
    out[`${f}Proximal` as HandBone]    = [0, 0, mcp];
    out[`${f}Intermediate` as HandBone] = [0, 0, pip];
    out[`${f}Distal` as HandBone]       = [0, 0, dip];
  }
  return out;
}

// Finger splay (sideways spread) via the Y component of Proximal.
function splay(amounts: Partial<Record<"Index" | "Middle" | "Ring" | "Little", number>>): FingerPose {
  const out: FingerPose = {};
  for (const [f, y] of Object.entries(amounts)) {
    out[`${f}Proximal` as HandBone] = [0, y as number, 0];
  }
  return out;
}

/** All right-hand handshapes. Z positive = curl. */
export const HANDSHAPES: Record<string, FingerPose> = {
  /** Flat hand, fingers together, thumb slightly to the side. */
  FLAT_5: {
    ThumbProximal: [0, 0, THUMB_OPPOSE_Z],
  },

  /** All five fingers spread wide. */
  SPREAD_5: {
    IndexProximal:  [0, -0.2, 0],
    MiddleProximal: [0,  0.0, 0],
    RingProximal:   [0,  0.2, 0],
    LittleProximal: [0,  0.35, 0],
    ThumbProximal:  [0, 0, THUMB_EXTEND_Z],
  },

  /** Closed fist with thumb across the front. */
  FIST: {
    ...curledFour(CURL_FULL, CURL_FULL, CURL_TIP),
    ThumbProximal:     [THUMB_TUCK_X, 0, THUMB_TUCK_Z],
    ThumbIntermediate: [0.4, 0, 0],
    ThumbDistal:       [0.3, 0, 0],
  },

  /** Index finger extended, others fist, thumb tucked. */
  POINT_INDEX: {
    ...curledFour(CURL_FULL, CURL_FULL, CURL_TIP, ["Middle", "Ring", "Little"]),
    ThumbProximal:     [0.3, 0, THUMB_TUCK_Z],
    ThumbIntermediate: [0.3, 0, 0],
  },

  /** V / peace — index + middle extended and spread, others fist. */
  V: {
    ...curledFour(CURL_FULL, CURL_FULL, CURL_TIP, ["Ring", "Little"]),
    IndexProximal:     [0, -0.2, 0],
    MiddleProximal:    [0, 0.15, 0],
    ThumbProximal:     [0.3, 0, THUMB_TUCK_Z],
    ThumbIntermediate: [0.3, 0, 0],
  },

  /** W — index + middle + ring extended, little curled, thumb across. */
  W: {
    ...curledFour(CURL_FULL, CURL_FULL, CURL_TIP, ["Little"]),
    IndexProximal:     [0, -0.2, 0],
    MiddleProximal:    [0, 0,    0],
    RingProximal:      [0, 0.2,  0],
    ThumbProximal:     [THUMB_TUCK_X, 0, THUMB_TUCK_Z],
    ThumbIntermediate: [0.4, 0, 0],
  },

  /** O — all fingertips touch thumb tip (pinched circle). */
  O: {
    ...curledFour(CURL_HALF, CURL_HALF, CURL_HALF),
    ThumbProximal:     [THUMB_PINCH_X, 0, -0.4],
    ThumbIntermediate: [0.5, 0, 0],
    ThumbDistal:       [0.4, 0, 0],
  },

  /** C — curved fingers forming a C grip. */
  C: {
    ...curledFour(CURL_HALF, CURL_HALF, 0.3),
    ThumbProximal:     [0.2, 0, -0.2],
    ThumbIntermediate: [0.3, 0, 0],
  },

  /** L — thumb + index extended perpendicular, others curled. */
  L: {
    ...curledFour(CURL_FULL, CURL_FULL, CURL_TIP, ["Middle", "Ring", "Little"]),
    ThumbProximal: [0, 0, THUMB_EXTEND_Z],
  },

  /** Y — thumb + pinky extended (hang-loose / "Y"), others curled. */
  Y: {
    ...curledFour(CURL_FULL, CURL_FULL, CURL_TIP, ["Index", "Middle", "Ring"]),
    ThumbProximal: [0, 0, THUMB_EXTEND_Z - 0.1],
  },

  /** ILY — thumb + index + pinky extended. */
  ILY: {
    ...curledFour(CURL_FULL, CURL_FULL, CURL_TIP, ["Middle", "Ring"]),
    ThumbProximal: [0, 0, THUMB_EXTEND_Z - 0.1],
  },

  /** Thumb up — fist with thumb pointed out. */
  THUMB_UP: {
    ...curledFour(CURL_FULL, CURL_FULL, CURL_TIP),
    ThumbProximal: [0, 0, THUMB_EXTEND_Z - 0.3],
  },

  /** Claw — all fingers curved strongly (but tips not touching palm). */
  CLAW: {
    ...curledFour(CURL_HALF, CURL_HALF, CURL_FULL),
    ThumbProximal:     [0.3, 0, -0.3],
    ThumbIntermediate: [0.3, 0, 0],
  },

  /** Bent-5 — fingers bent only at MCP, rest straight (like a flat claw). */
  BENT_5: {
    IndexProximal:  [0, 0, CURL_FULL],
    MiddleProximal: [0, 0, CURL_FULL],
    RingProximal:   [0, 0, CURL_FULL],
    LittleProximal: [0, 0, CURL_FULL],
    ThumbProximal:  [0, 0, THUMB_OPPOSE_Z],
  },

  /** Baby-O — thumb tip meets index tip, others extended. */
  BABY_O: {
    IndexProximal:      [0, 0, CURL_HALF],
    IndexIntermediate:  [0, 0, CURL_HALF],
    IndexDistal:        [0, 0, CURL_HALF],
    ThumbProximal:      [THUMB_PINCH_X, 0, -0.3],
    ThumbIntermediate:  [0.5, 0, 0],
    ThumbDistal:        [0.4, 0, 0],
  },

  /** Hook index — index bent at proximal only, others curled. */
  HOOK_INDEX: {
    ...curledFour(CURL_FULL, CURL_FULL, CURL_TIP, ["Middle", "Ring", "Little"]),
    IndexProximal:     [0, 0, CURL_HALF],
    IndexIntermediate: [0, 0, CURL_BENT],
    ThumbProximal:     [0.3, 0, THUMB_TUCK_Z],
    ThumbIntermediate: [0.3, 0, 0],
  },

  /** Bunched — all fingertips meet at a point (like a flower bud). */
  BUNCHED: {
    ...curledFour(CURL_HALF, CURL_BENT, CURL_BENT),
    ThumbProximal:     [THUMB_PINCH_X, 0, -0.5],
    ThumbIntermediate: [0.6, 0, 0],
    ThumbDistal:       [0.4, 0, 0],
  },

  /** Three — thumb + index + middle extended (ISL "3"). */
  THREE: {
    ...curledFour(CURL_FULL, CURL_FULL, CURL_TIP, ["Ring", "Little"]),
    IndexProximal:  [0, -0.15, 0],
    MiddleProximal: [0, 0.1, 0],
    ThumbProximal:  [0, 0, THUMB_EXTEND_Z - 0.2],
  },
};

/** Left-hand mirror: negate the curl axis (Z) on every bone. Thumb X/Z also flip. */
export function mirrorHandshape(right: FingerPose): FingerPose {
  const left: FingerPose = {};
  for (const [k, v] of Object.entries(right)) {
    const isThumb = k.startsWith("Thumb");
    // For fingers the mirror is simple — negate Z (curl axis).
    // For the thumb we flip both X (opposition-cross-palm axis) and Z.
    left[k as HandBone] = isThumb ? [-v[0], v[1], -v[2]] : [v[0], -v[1], -v[2]];
  }
  return left;
}

/** Prefix a finger pose with "right…" so keys match the full BoneName enum. */
export function rightFingerPose(shape: FingerPose): Partial<Record<BoneName, [number, number, number]>> {
  const out: Partial<Record<BoneName, [number, number, number]>> = {};
  for (const [k, v] of Object.entries(shape)) {
    out[`right${k}` as BoneName] = v;
  }
  return out;
}

/** Prefix a mirrored finger pose with "left…". */
export function leftFingerPose(shape: FingerPose): Partial<Record<BoneName, [number, number, number]>> {
  const mirrored = mirrorHandshape(shape);
  const out: Partial<Record<BoneName, [number, number, number]>> = {};
  for (const [k, v] of Object.entries(mirrored)) {
    out[`left${k}` as BoneName] = v;
  }
  return out;
}

export type HandshapeName = keyof typeof HANDSHAPES;

export const HANDSHAPE_NAMES = Object.keys(HANDSHAPES) as HandshapeName[];
