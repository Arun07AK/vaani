import type { BoneName } from "./bones";
import {
  HANDSHAPES,
  leftFingerPose,
  rightFingerPose,
  type HandshapeName,
} from "./handshapes";
import {
  LOCATIONS,
  leftArmLocation,
  type ArmPose,
  type LocationName,
} from "./locations";
import {
  PALM_ORIENTATIONS,
  leftPalmOrientation,
  type OrientationDelta,
  type PalmOrientationName,
} from "./palmOrientations";
import { movementFor, type MovementName } from "./movements";

/**
 * A phonological decomposition of an ISL sign. This is the unit the
 * composition runtime and the LLM gloss schema both agree on.
 */
export type SignComposition = {
  /** Right-hand handshape (dominant). */
  handshape: HandshapeName;
  /** Optional left-hand handshape (two-handed signs only). */
  nondominantHandshape?: HandshapeName;
  /** Palm orientation of the dominant hand. */
  palm: PalmOrientationName;
  /** Optional palm orientation of the non-dominant hand; defaults to mirror of dominant. */
  nondominantPalm?: PalmOrientationName;
  /** Body-landmark location for the dominant hand. */
  location: LocationName;
  /** Optional location for the non-dominant hand; defaults to mirror of dominant. */
  nondominantLocation?: LocationName;
  /** Time-varying movement pattern over the sign. */
  movement: MovementName;
  /** Total sign duration in milliseconds. */
  durationMs: number;
  /** Optional provenance note (e.g. "ISLRTC Sign Learn app"). */
  source?: string;
};

export type BonePose = Partial<Record<BoneName, [number, number, number]>>;

/** Merge pose B on top of pose A (B wins when keys overlap). */
function merge(...poses: BonePose[]): BonePose {
  const out: BonePose = {};
  for (const p of poses) {
    for (const [k, v] of Object.entries(p)) {
      out[k as BoneName] = v;
    }
  }
  return out;
}

/** Component-wise add two poses (for applying movement deltas). */
function add(base: BonePose, delta: BonePose): BonePose {
  const out: BonePose = { ...base };
  for (const [k, v] of Object.entries(delta)) {
    const existing = out[k as BoneName] ?? ([0, 0, 0] as [number, number, number]);
    out[k as BoneName] = [
      existing[0] + v[0],
      existing[1] + v[1],
      existing[2] + v[2],
    ];
  }
  return out;
}

/**
 * Sample a composed sign at a given normalized time (0..1).
 * Layers (lowest to highest precedence): location → palm → handshape → movement delta.
 */
export function composeSign(spec: SignComposition, tNorm: number): BonePose {
  // Dominant hand — right side.
  const domLocation: ArmPose = LOCATIONS[spec.location] ?? LOCATIONS.NEUTRAL_SIDE;
  const domPalm: OrientationDelta = PALM_ORIENTATIONS[spec.palm] ?? PALM_ORIENTATIONS.PALM_IN;
  const domHand = rightFingerPose(HANDSHAPES[spec.handshape] ?? HANDSHAPES.FLAT_5);

  let base = merge(domLocation, domPalm, domHand);

  // Non-dominant hand (two-handed signs).
  const isOneHanded = !spec.nondominantHandshape;
  if (spec.nondominantHandshape) {
    const nondomLocName = spec.nondominantLocation ?? spec.location;
    const nondomPalmName = spec.nondominantPalm ?? spec.palm;
    const nondomLocation = leftArmLocation(LOCATIONS[nondomLocName] ?? LOCATIONS.NEUTRAL_SIDE);
    const nondomPalm = leftPalmOrientation(
      PALM_ORIENTATIONS[nondomPalmName] ?? PALM_ORIENTATIONS.PALM_IN,
    );
    const nondomHand = leftFingerPose(HANDSHAPES[spec.nondominantHandshape] ?? HANDSHAPES.FLAT_5);
    base = merge(base, nondomLocation, nondomPalm, nondomHand);
  } else {
    // Single-handed: left arm at rest, left fingers in a relaxed open
    // pose (FLAT_5). Without the finger pose, the left fingers slerp to
    // identity → T-pose straight → looks frozen next to the curled right.
    base = merge(
      base,
      leftArmLocation(LOCATIONS.NEUTRAL_SIDE),
      leftFingerPose(HANDSHAPES.FLAT_5),
    );
  }

  // Movement delta — strip left-side keys for single-handed signs so the
  // non-dominant arm doesn't tap/circle in empty space.
  const delta = movementFor(spec.movement)(tNorm, { oneHanded: isOneHanded });
  return add(base, delta);
}

/** Fingerprint a composition for anti-repetition similarity checks. */
export function compositionFingerprint(spec: SignComposition): string {
  const handshapes = [spec.handshape, spec.nondominantHandshape ?? "_"].join(",");
  const palms = [spec.palm, spec.nondominantPalm ?? "_"].join(",");
  const locs = [spec.location, spec.nondominantLocation ?? "_"].join(",");
  return `${handshapes}|${palms}|${locs}|${spec.movement}`;
}
