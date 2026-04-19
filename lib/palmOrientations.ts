import type { BoneName } from "./bones";

/**
 * Palm orientation via lower-arm pronation + wrist flex. Each orientation
 * is expressed as a DELTA to apply ON TOP of the location's arm pose.
 * (Rotations compose — we apply location first, then orientation deltas
 * to the lower arm and hand.)
 *
 * Values authored for the right hand; mirror via `leftPalmOrientation()`.
 */

export type OrientationDelta = Partial<Record<BoneName, [number, number, number]>>;

export const PALM_ORIENTATIONS: Record<string, OrientationDelta> = {
  /** Palm down, facing the floor. */
  PALM_DOWN: {
    rightLowerArm: [0, 0, 0],
    rightHand:     [0, 0, 0],
  },

  /** Palm up, facing the ceiling. */
  PALM_UP: {
    rightLowerArm: [0, 0, -Math.PI],
    rightHand:     [0, 0, 0],
  },

  /** Palm toward signer's own body. */
  PALM_IN: {
    rightLowerArm: [0, 0, -Math.PI / 2],
    rightHand:     [0, 0, 0],
  },

  /** Palm facing the addressee / camera. */
  PALM_OUT: {
    rightLowerArm: [0, 0, Math.PI / 2],
    rightHand:     [0, 0, 0],
  },

  /** Palm at a 45° angle pointing in + up. */
  PALM_SIDE_IN: {
    rightLowerArm: [0, 0, -Math.PI / 4],
    rightHand:     [0, 0, 0],
  },

  /** Palm at a 45° angle pointing out + up. */
  PALM_SIDE_OUT: {
    rightLowerArm: [0, 0, Math.PI / 4],
    rightHand:     [0, 0, 0],
  },
};

export type PalmOrientationName = keyof typeof PALM_ORIENTATIONS;

/** Mirror a right-hand palm orientation delta to left. */
export function leftPalmOrientation(right: OrientationDelta): OrientationDelta {
  const out: OrientationDelta = {};
  for (const [k, v] of Object.entries(right)) {
    const leftKey = k.replace(/^right/, "left") as BoneName;
    if (k.endsWith("LowerArm")) {
      out[leftKey] = [v[0], v[1], -v[2]];
    } else {
      out[leftKey] = [v[0], -v[1], -v[2]];
    }
  }
  return out;
}
