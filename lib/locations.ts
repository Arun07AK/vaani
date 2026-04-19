import type { BoneName } from "./bones";

/**
 * Canonical body-landmark locations for placing a signing hand.
 *
 * Each entry specifies the RIGHT-HAND upper + lower arm rotations that
 * put the wrist at/near a recognizable body landmark. Mirror via
 * `leftArmLocation()` (flips Z on upper, flips Y on lower).
 *
 * Conventions (verified in our VRM1 sample + signArmPoses.ts):
 *   - rightUpperArm.z POSITIVE → arm down at side
 *   - rightLowerArm.y POSITIVE → elbow flexes forward (hand toward face)
 *   - leftUpperArm.z NEGATIVE → arm down at side  (mirror)
 *   - leftLowerArm.y NEGATIVE → elbow flex  (mirror)
 */

export type ArmPose = Partial<Record<BoneName, [number, number, number]>>;

/** Right-hand canonical locations. */
export const LOCATIONS: Record<string, ArmPose> = {
  /** Arm hanging at side, relaxed. */
  NEUTRAL_SIDE: {
    rightUpperArm: [0, 0, 1.3],
    rightLowerArm: [0, 0.2, 0],
  },

  /** Arm in front of body, at belly height. */
  NEUTRAL_LOW: {
    rightUpperArm: [-0.4, 0.3, 1.0],
    rightLowerArm: [0, 0.7, 0],
  },

  /** Hand forward at chest height, elbow bent ~90°. */
  NEUTRAL_FORWARD: {
    rightUpperArm: [-0.9, 0.3, 0.9],
    rightLowerArm: [0, 1.0, 0],
  },

  /** Flat palm on own chest. */
  CHEST: {
    rightUpperArm: [-0.8, 0.5, 0.8],
    rightLowerArm: [0, 1.4, 0],
  },

  /** Hand at chin / throat area. */
  CHIN: {
    rightUpperArm: [-1.1, 0.3, 0.9],
    rightLowerArm: [0, 1.5, 0],
  },

  /** Hand at mouth. */
  MOUTH: {
    rightUpperArm: [-1.2, 0.35, 0.8],
    rightLowerArm: [0, 1.55, 0],
  },

  /** Hand at temple / side of head. */
  TEMPLE: {
    rightUpperArm: [-1.4, 0.6, 0.5],
    rightLowerArm: [0, 1.4, 0],
  },

  /** Hand at forehead. */
  FOREHEAD: {
    rightUpperArm: [-1.5, 0.4, 0.7],
    rightLowerArm: [0, 1.3, 0],
  },

  /** Hand at ear. */
  EAR: {
    rightUpperArm: [-1.3, 0.7, 0.4],
    rightLowerArm: [0, 1.5, 0],
  },

  /** Hand at cheek. */
  CHEEK: {
    rightUpperArm: [-1.25, 0.55, 0.55],
    rightLowerArm: [0, 1.5, 0],
  },

  /** Hand on same-side shoulder. */
  SHOULDER_SAME: {
    rightUpperArm: [-1.0, 0.2, 0.6],
    rightLowerArm: [0, 1.6, 0],
  },

  /** Hand crossed over to opposite-side shoulder. */
  SHOULDER_OPPOSITE: {
    rightUpperArm: [-0.7, 1.0, 0.7],
    rightLowerArm: [0, 1.4, 0],
  },

  /** High signing space — hand above shoulder. */
  SPACE_HIGH: {
    rightUpperArm: [-1.8, 0.3, 0.5],
    rightLowerArm: [0, 0.8, 0],
  },

  /** Extended out to the side. */
  SIDE_EXTENDED: {
    rightUpperArm: [0, 0, 0.2],
    rightLowerArm: [0, 0.1, 0],
  },
};

export type LocationName = keyof typeof LOCATIONS;

/** Mirror a right-arm location to left. */
export function leftArmLocation(right: ArmPose): ArmPose {
  const out: ArmPose = {};
  for (const [k, v] of Object.entries(right)) {
    const leftKey = k.replace(/^right/, "left") as BoneName;
    if (k.endsWith("UpperArm")) {
      // Mirror upper arm: flip z (arm-down axis) and y (across-body axis)
      out[leftKey] = [v[0], -v[1], -v[2]];
    } else if (k.endsWith("LowerArm")) {
      // Mirror lower arm: flip y (elbow-flex axis)
      out[leftKey] = [v[0], -v[1], v[2]];
    } else {
      out[leftKey] = [...v] as [number, number, number];
    }
  }
  return out;
}
