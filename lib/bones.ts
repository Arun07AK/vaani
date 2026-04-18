/**
 * Canonical VRM humanoid bone names used throughout the app.
 * These are the camelCase keys that @pixiv/three-vrm exposes via
 * VRMHumanBoneName. The enum here is a deliberately narrower set —
 * only bones that the motion pipeline drives.
 */
export const BONE_NAMES = [
  "head",
  "neck",
  "spine",
  "chest",
  "upperChest",
  "hips",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftThumbProximal",
  "leftThumbIntermediate",
  "leftThumbDistal",
  "leftIndexProximal",
  "leftIndexIntermediate",
  "leftIndexDistal",
  "leftMiddleProximal",
  "leftMiddleIntermediate",
  "leftMiddleDistal",
  "leftRingProximal",
  "leftRingIntermediate",
  "leftRingDistal",
  "leftLittleProximal",
  "leftLittleIntermediate",
  "leftLittleDistal",
  "rightThumbProximal",
  "rightThumbIntermediate",
  "rightThumbDistal",
  "rightIndexProximal",
  "rightIndexIntermediate",
  "rightIndexDistal",
  "rightMiddleProximal",
  "rightMiddleIntermediate",
  "rightMiddleDistal",
  "rightRingProximal",
  "rightRingIntermediate",
  "rightRingDistal",
  "rightLittleProximal",
  "rightLittleIntermediate",
  "rightLittleDistal",
] as const;

export type BoneName = (typeof BONE_NAMES)[number];

export const BONE_NAME_SET = new Set<string>(BONE_NAMES);
