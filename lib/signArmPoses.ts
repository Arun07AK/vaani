import type { BoneName } from "./bones";

/**
 * Per-sign arm + head poses that are LAYERED UNDER the captured mocap finger
 * data. Our ISLRTC capture pipeline produced clean finger rotations but empty
 * body rotations (chest-up framing defeated MediaPipe pose detection). These
 * hand-authored arm positions put the hand in the right place while the
 * mocap fingers do the actual handshape animation.
 *
 * All rotations are VRM-humanoid Eulers in radians, XYZ order.
 *
 * Axis convention on normalized VRM 1.0 bones (verified empirically):
 *   - leftUpperArm.z NEGATIVE  → arm swings DOWN to the side (rest)
 *   - leftUpperArm.z POSITIVE  → arm swings UP overhead
 *   - rightUpperArm.z POSITIVE → arm swings DOWN (mirror of left)
 *   - rightUpperArm.z NEGATIVE → arm swings UP overhead
 *   - *LowerArm.y               → elbow flexion (signs mirror between hands)
 */

export type ArmPose = Partial<Record<BoneName, [number, number, number]>>;

// Default rest pose — arms down at sides, head neutral. Used as fallback.
export const REST_POSE: ArmPose = {
  leftUpperArm: [0, 0, -1.3],
  rightUpperArm: [0, 0, 1.3],
  leftLowerArm: [0, 0.2, 0],
  rightLowerArm: [0, -0.2, 0],
};

const mergeRest = (overrides: ArmPose): ArmPose => ({ ...REST_POSE, ...overrides });

export const ARM_POSES: Record<string, ArmPose> = {
  // HELLO — right arm raised up + slightly forward, wave motion in hand/fingers
  HELLO: mergeRest({
    rightUpperArm: [0, 0.3, 2.4],
    rightLowerArm: [0, -0.6, 0.1],
    rightHand: [0.2, 0, 0],
    head: [0.05, 0.1, 0],
  }),

  // THANK-YOU — flat palm to chin, arm forward+up
  "THANK-YOU": mergeRest({
    rightUpperArm: [-1.1, 0.3, 0.9],
    rightLowerArm: [0, -1.5, 0],
    rightHand: [0.3, 0, 0],
    head: [0.05, 0, 0],
  }),

  // MY — flat hand on chest
  MY: mergeRest({
    rightUpperArm: [-0.8, 0.5, 0.9],
    rightLowerArm: [0, -1.4, 0],
    rightHand: [0.2, 0.1, 0],
  }),

  // I — index finger points to self (chest)
  I: mergeRest({
    rightUpperArm: [-0.6, 0.8, 0.8],
    rightLowerArm: [0, -1.2, 0],
    rightHand: [0.1, 0, 0],
  }),

  // YOU — index finger extended forward to camera
  YOU: mergeRest({
    rightUpperArm: [-1.0, 0.3, 0.9],
    rightLowerArm: [0, -0.8, 0],
    rightHand: [0, 0, 0],
  }),

  // FRIEND — both hands forward, interlocking hook position
  FRIEND: mergeRest({
    leftUpperArm: [-0.9, -0.3, -0.9],
    rightUpperArm: [-0.9, 0.3, 0.9],
    leftLowerArm: [0, 1.1, 0],
    rightLowerArm: [0, -1.1, 0],
    leftHand: [0.1, 0, 0],
    rightHand: [0.1, 0, 0],
  }),

  // NAME — two hands tap across each other
  NAME: mergeRest({
    leftUpperArm: [-0.9, -0.3, -0.9],
    rightUpperArm: [-0.9, 0.3, 0.9],
    leftLowerArm: [0, 1.2, 0],
    rightLowerArm: [0, -1.2, 0],
  }),

  // WATER — "W" handshape near chin
  WATER: mergeRest({
    rightUpperArm: [-1.1, 0.3, 0.9],
    rightLowerArm: [0, -1.6, 0],
    rightHand: [0.3, 0, 0],
    head: [0.05, 0, 0],
  }),

  // WANT — both hands forward, drawn inward
  WANT: mergeRest({
    leftUpperArm: [-0.8, -0.2, -1.0],
    rightUpperArm: [-0.8, 0.2, 1.0],
    leftLowerArm: [0, 1.3, 0],
    rightLowerArm: [0, -1.3, 0],
    leftHand: [0.2, 0, 0],
    rightHand: [0.2, 0, 0],
  }),

  // WHAT — palm up, arm forward, slight head tilt (wh-NMM)
  WHAT: mergeRest({
    rightUpperArm: [-0.6, 0.3, 0.8],
    rightLowerArm: [0, -0.9, 0],
    rightHand: [0.3, 0, 0],
    head: [-0.1, 0.1, 0],
  }),

  // SEE — "V" handshape near eyes, pointing outward
  SEE: mergeRest({
    rightUpperArm: [-1.0, 0.7, 0.6],
    rightLowerArm: [0, -1.3, 0],
    rightHand: [-0.1, 0, 0],
  }),

  // YES — fist nods; right hand slightly forward of chest
  YES: mergeRest({
    rightUpperArm: [-0.7, 0.4, 0.9],
    rightLowerArm: [0, -1.2, 0],
    rightHand: [0.2, 0, 0],
    head: [0.15, 0, 0],
  }),

  // NO — index+middle tap thumb; subtle head shake
  NO: mergeRest({
    rightUpperArm: [-0.9, 0.3, 1.0],
    rightLowerArm: [0, -1.3, 0],
    rightHand: [0, 0.2, 0],
    head: [0, 0.15, 0],
  }),
};

export function armPoseFor(gloss: string): ArmPose {
  return ARM_POSES[gloss.toUpperCase()] ?? REST_POSE;
}
