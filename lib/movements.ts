import type { BoneName } from "./bones";

/**
 * Movement modulators. Each movement is a function that, given a NORMALIZED
 * time tNorm ∈ [0, 1] within the sign, returns a DELTA of bone rotations to
 * add on top of the static (handshape + location + palm) composition.
 *
 * By keeping movement additive, we can compose:
 *   base = handshape ∪ location ∪ palm
 *   final(t) = base + movement(t)
 *
 * Delta values are small (±0.05 to ±0.3 rad) because they ride on top of
 * a solid static pose — they're accents, not positions.
 */

export type BoneDelta = Partial<Record<BoneName, [number, number, number]>>;

export type Movement = (
  tNorm: number,
  opts?: { leftHanded?: boolean; oneHanded?: boolean },
) => BoneDelta;

// ---- Individual movements --------------------------------------------------

/** Static hold — no movement. */
const HOLD: Movement = () => ({});

/** Tap once — oscillate the hand forward once over the sign. */
const TAP_ONCE: Movement = (t) => {
  // Single half-sine: forward at 0.5, back at 1.0
  const phase = Math.sin(t * Math.PI) * 0.15;
  return {
    rightLowerArm: [0, phase, 0],
    leftLowerArm:  [0, -phase, 0],
  };
};

/** Tap twice — two forward taps evenly distributed. */
const TAP_TWICE: Movement = (t) => {
  const phase = Math.sin(t * Math.PI * 2) * 0.12;
  return {
    rightLowerArm: [0, phase, 0],
    leftLowerArm:  [0, -phase, 0],
  };
};

/** Wiggle fingers — curl/uncurl at high frequency. */
const WIGGLE_FINGERS: Movement = (t) => {
  const phase = Math.sin(t * Math.PI * 6) * 0.15;
  const fingers: BoneDelta = {};
  for (const side of ["right", "left"] as const) {
    for (const finger of ["Index", "Middle", "Ring", "Little"]) {
      const sign = side === "left" ? -1 : 1;
      fingers[`${side}${finger}Proximal` as BoneName] = [0, 0, phase * sign];
      fingers[`${side}${finger}Intermediate` as BoneName] = [0, 0, phase * sign * 0.7];
    }
  }
  return fingers;
};

/** Circle clockwise — wrist moves in a small circle. */
const CIRCLE_CW: Movement = (t) => {
  const angle = t * Math.PI * 2;
  const x = Math.sin(angle) * 0.15;
  const y = Math.cos(angle) * 0.15;
  return {
    rightHand: [x, y, 0],
    leftHand:  [x, -y, 0],
  };
};

/** Circle counter-clockwise. */
const CIRCLE_CCW: Movement = (t) => {
  const angle = t * Math.PI * 2;
  const x = Math.sin(angle) * 0.15;
  const y = -Math.cos(angle) * 0.15;
  return {
    rightHand: [x, y, 0],
    leftHand:  [x, -y, 0],
  };
};

/** Arc up — hand rises over the sign. */
const ARC_UP: Movement = (t) => {
  const rise = Math.sin(t * Math.PI) * 0.3;
  return {
    rightUpperArm: [-rise, 0, 0],
    leftUpperArm:  [-rise, 0, 0],
  };
};

/** Arc out — hand moves outward over the sign. */
const ARC_OUT: Movement = (t) => {
  const out = t * 0.3;
  return {
    rightUpperArm: [0, -out, 0],
    leftUpperArm:  [0, out, 0],
  };
};

/** Arc forward — hand moves toward the addressee. */
const ARC_FORWARD: Movement = (t) => {
  const forward = t * 0.35;
  return {
    rightUpperArm: [-forward, 0, 0],
    leftUpperArm:  [-forward, 0, 0],
  };
};

/** Side to side — wave-like lateral oscillation. */
const SIDE_TO_SIDE: Movement = (t) => {
  const phase = Math.sin(t * Math.PI * 4) * 0.2;
  return {
    rightHand: [0, phase, 0],
    leftHand:  [0, -phase, 0],
  };
};

/** Clap twice — both hands come together twice. */
const CLAP_TWICE: Movement = (t) => {
  // Two claps: hands come together at t=0.25 and t=0.75
  const phase = Math.abs(Math.sin(t * Math.PI * 2)) - 0.5;
  return {
    rightUpperArm: [0, -phase * 0.3, 0],
    leftUpperArm:  [0, phase * 0.3, 0],
  };
};

/** Downward throw — hand sweeps downward. */
const DOWNWARD_THROW: Movement = (t) => {
  const fall = t * 0.5;
  return {
    rightUpperArm: [fall, 0, 0],
    leftUpperArm:  [fall, 0, 0],
  };
};

/** Brush across — hand slides horizontally across body. */
const BRUSH_ACROSS: Movement = (t) => {
  const slide = (t - 0.5) * 0.5;
  return {
    rightUpperArm: [0, slide, 0],
    leftUpperArm:  [0, -slide, 0],
  };
};

/** Forward sweep — hand pushes forward and out. */
const FORWARD_SWEEP: Movement = (t) => {
  const push = t * 0.4;
  return {
    rightUpperArm: [-push, 0, 0],
    leftUpperArm:  [-push, 0, 0],
  };
};

/** Head nod — "yes" gesture. */
const HEAD_NOD: Movement = (t) => {
  const nod = Math.sin(t * Math.PI * 3) * 0.12;
  return { head: [nod, 0, 0] };
};

/** Head shake — "no" gesture. */
const HEAD_SHAKE: Movement = (t) => {
  const shake = Math.sin(t * Math.PI * 4) * 0.25;
  return { head: [0, shake, 0] };
};

// ---- Export table ----------------------------------------------------------

export const MOVEMENTS: Record<string, Movement> = {
  HOLD,
  TAP_ONCE,
  TAP_TWICE,
  WIGGLE_FINGERS,
  CIRCLE_CW,
  CIRCLE_CCW,
  ARC_UP,
  ARC_OUT,
  ARC_FORWARD,
  SIDE_TO_SIDE,
  CLAP_TWICE,
  DOWNWARD_THROW,
  BRUSH_ACROSS,
  FORWARD_SWEEP,
  HEAD_NOD,
  HEAD_SHAKE,
};

export type MovementName = keyof typeof MOVEMENTS;

/**
 * One-handed gate. Strips any `left*` keys from the movement delta so the
 * non-dominant arm stays at rest on single-handed signs (otherwise it would
 * tap/circle in empty space next to the body). Head bones pass through.
 */
function stripLeftSideKeys(delta: BoneDelta): BoneDelta {
  const out: BoneDelta = {};
  for (const [k, v] of Object.entries(delta)) {
    if (!k.startsWith("left")) out[k as BoneName] = v;
  }
  return out;
}

export function movementFor(name: string): Movement {
  const base = MOVEMENTS[name] ?? HOLD;
  return (tNorm, opts) => {
    const delta = base(tNorm, opts);
    return opts?.oneHanded ? stripLeftSideKeys(delta) : delta;
  };
}
