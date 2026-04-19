import { VRMHumanBoneName } from "@pixiv/three-vrm";

export type BoneEuler = [number, number, number]; // x, y, z in radians
export type Pose = Partial<Record<VRMHumanBoneName, BoneEuler>>;

/**
 * Static target rotations per bone, in the VRM 1.0 normalized humanoid space.
 * T-pose is the 0-rotation reference. Axis convention (verified on our VRM):
 *   - leftUpperArm.z  NEGATIVE → arm DOWN; POSITIVE → arm OVERHEAD
 *   - rightUpperArm.z POSITIVE → arm DOWN; NEGATIVE → arm OVERHEAD
 *   - leftLowerArm.y  NEGATIVE → elbow flexes FORWARD (hand → face)
 *   - rightLowerArm.y POSITIVE → elbow flexes FORWARD (hand → face)
 *   - hand.x POSITIVE → wrist flexes forward
 */

const REST_ARMS: Pose = {
  leftUpperArm: [0, 0, -1.3],
  rightUpperArm: [0, 0, 1.3],
  leftLowerArm: [0, -0.2, 0],
  rightLowerArm: [0, 0.2, 0],
};

export const POSES: Record<string, Pose> = {
  Idle: {
    ...REST_ARMS,
    head: [0, 0, 0],
    spine: [0, 0, 0],
  },

  // HELLO — right arm up, palm forward
  Wave: {
    ...REST_ARMS,
    rightUpperArm: [0, 0.3, 2.6],
    rightLowerArm: [0, 0.8, 0],
    rightHand: [0, 0, 0.3],
    head: [0.05, 0.15, 0],
  },

  // THANK-YOU / PLEASE — both hands forward, thumbs up feel
  ThumbsUp: {
    ...REST_ARMS,
    rightUpperArm: [-1.0, 0.1, 1.0],
    rightLowerArm: [0, 1.2, 0],
    rightThumbProximal: [0, 0, -0.4],
    head: [0.05, 0, 0],
  },

  // YES — head nods (we'll also apply head-bob in frame loop)
  Yes: {
    ...REST_ARMS,
    head: [0.25, 0, 0],
  },

  // NO / WH — head turned, neutral stance
  No: {
    ...REST_ARMS,
    head: [0, 0.35, 0],
    rightUpperArm: [0, 0, 1.1],
    rightLowerArm: [0, 0.3, 0],
  },

  // YOU / NUMBERS / ASTRONAUT — arms spread / point
  Jump: {
    leftUpperArm: [0, 0, -1.8],
    rightUpperArm: [0, 0, 1.8],
    leftLowerArm: [0, -0.1, 0],
    rightLowerArm: [0, 0.1, 0],
    head: [0.1, 0, 0],
    spine: [-0.05, 0, 0],
  },

  // STAR / EARTH / DANCE — both arms up and out
  Dance: {
    leftUpperArm: [-0.5, 0, -2.4],
    rightUpperArm: [-0.5, 0, 2.4],
    leftLowerArm: [0, -0.5, 0],
    rightLowerArm: [0, 0.5, 0],
    head: [0, 0.2, 0],
    spine: [0, 0.2, 0],
  },

  // GO / COME — walking stance
  Walking: {
    leftUpperArm: [0.3, 0, -1.2],
    rightUpperArm: [-0.3, 0, 1.2],
    leftLowerArm: [0, -0.4, 0],
    rightLowerArm: [0, 0.4, 0],
  },
};

export function poseFor(clipName: string): Pose {
  return POSES[clipName] ?? POSES.Idle;
}

/** Extra per-frame driver by NMM tag (applied on top of static pose). */
export function nmmFrameOffset(
  nmm: "wh" | "neg" | "yn" | undefined,
  elapsedSec: number,
): Partial<Record<VRMHumanBoneName, BoneEuler>> {
  if (nmm === "wh" || nmm === "yn") {
    // raised brow hint via slight head-up + tilt
    return { head: [-0.1, Math.sin(elapsedSec * 3) * 0.08, 0] };
  }
  if (nmm === "neg") {
    // head shake (y oscillation)
    return { head: [0, Math.sin(elapsedSec * 8) * 0.35, 0] };
  }
  return {};
}

/** ARKit morph-target driver for ISL non-manual markers (facial expression).
 *  Returns a map of morph-target name → influence 0..1. Consumer looks these
 *  up against morphTargetDictionary on the VRM head/face mesh. */
export type NmmMorphs = {
  browInnerUp?: number;
  browDownLeft?: number;
  browDownRight?: number;
  mouthFunnel?: number;
  mouthPucker?: number;
  eyeWideLeft?: number;
  eyeWideRight?: number;
};

export function nmmMorphTargets(
  nmm: "wh" | "neg" | "yn" | undefined,
  elapsedSec: number,
): NmmMorphs {
  if (!nmm) return {};
  // Ease in over 250ms so the expression lands with the sign, not before it.
  const attack = Math.min(1, elapsedSec / 0.25);
  if (nmm === "wh") {
    // ISL WH-questions: furrowed+raised inner brows, slight mouth-funnel
    return {
      browInnerUp: 0.9 * attack,
      mouthFunnel: 0.25 * attack,
    };
  }
  if (nmm === "yn") {
    // Yes/No questions: sustained inner-brow raise with eye widening
    return {
      browInnerUp: 1.0 * attack,
      eyeWideLeft: 0.35 * attack,
      eyeWideRight: 0.35 * attack,
    };
  }
  // neg: compressed brows during the head shake
  return {
    browDownLeft: 0.6 * attack,
    browDownRight: 0.6 * attack,
  };
}
