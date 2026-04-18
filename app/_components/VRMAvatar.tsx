"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VRMLoaderPlugin,
  VRMHumanBoneName,
  type VRM,
} from "@pixiv/three-vrm";
import { Euler, MathUtils, Quaternion } from "three";
import {
  nmmFrameOffset,
  poseFor,
  type BoneEuler as PoseBoneEuler,
  type Pose,
} from "@/lib/vrmPoses";
import type { GlossToken } from "@/lib/stores/pipeline";
import type { SignEntry } from "@/lib/lexicon";
import type { BoneName } from "@/lib/bones";
import {
  sampleClip,
  type CaptureClip,
} from "@/lib/capturePlayer";
import { armPoseFor, REST_POSE } from "@/lib/signArmPoses";

const VRM_URL = "/avatars/vaani.vrm";

type CurrentSign = {
  token: GlossToken;
  entry: SignEntry;
} | null;

const LLM_BONE_TO_VRM: Record<BoneName, VRMHumanBoneName> = {
  head: VRMHumanBoneName.Head,
  neck: VRMHumanBoneName.Neck,
  spine: VRMHumanBoneName.Spine,
  chest: VRMHumanBoneName.Chest,
  upperChest: VRMHumanBoneName.UpperChest,
  hips: VRMHumanBoneName.Hips,
  leftShoulder: VRMHumanBoneName.LeftShoulder,
  leftUpperArm: VRMHumanBoneName.LeftUpperArm,
  leftLowerArm: VRMHumanBoneName.LeftLowerArm,
  leftHand: VRMHumanBoneName.LeftHand,
  rightShoulder: VRMHumanBoneName.RightShoulder,
  rightUpperArm: VRMHumanBoneName.RightUpperArm,
  rightLowerArm: VRMHumanBoneName.RightLowerArm,
  rightHand: VRMHumanBoneName.RightHand,
  leftThumbProximal: VRMHumanBoneName.LeftThumbProximal,
  leftThumbIntermediate: VRMHumanBoneName.LeftThumbMetacarpal,
  leftThumbDistal: VRMHumanBoneName.LeftThumbDistal,
  leftIndexProximal: VRMHumanBoneName.LeftIndexProximal,
  leftIndexIntermediate: VRMHumanBoneName.LeftIndexIntermediate,
  leftIndexDistal: VRMHumanBoneName.LeftIndexDistal,
  leftMiddleProximal: VRMHumanBoneName.LeftMiddleProximal,
  leftMiddleIntermediate: VRMHumanBoneName.LeftMiddleIntermediate,
  leftMiddleDistal: VRMHumanBoneName.LeftMiddleDistal,
  leftRingProximal: VRMHumanBoneName.LeftRingProximal,
  leftRingIntermediate: VRMHumanBoneName.LeftRingIntermediate,
  leftRingDistal: VRMHumanBoneName.LeftRingDistal,
  leftLittleProximal: VRMHumanBoneName.LeftLittleProximal,
  leftLittleIntermediate: VRMHumanBoneName.LeftLittleIntermediate,
  leftLittleDistal: VRMHumanBoneName.LeftLittleDistal,
  rightThumbProximal: VRMHumanBoneName.RightThumbProximal,
  rightThumbIntermediate: VRMHumanBoneName.RightThumbMetacarpal,
  rightThumbDistal: VRMHumanBoneName.RightThumbDistal,
  rightIndexProximal: VRMHumanBoneName.RightIndexProximal,
  rightIndexIntermediate: VRMHumanBoneName.RightIndexIntermediate,
  rightIndexDistal: VRMHumanBoneName.RightIndexDistal,
  rightMiddleProximal: VRMHumanBoneName.RightMiddleProximal,
  rightMiddleIntermediate: VRMHumanBoneName.RightMiddleIntermediate,
  rightMiddleDistal: VRMHumanBoneName.RightMiddleDistal,
  rightRingProximal: VRMHumanBoneName.RightRingProximal,
  rightRingIntermediate: VRMHumanBoneName.RightRingIntermediate,
  rightRingDistal: VRMHumanBoneName.RightRingDistal,
  rightLittleProximal: VRMHumanBoneName.RightLittleProximal,
  rightLittleIntermediate: VRMHumanBoneName.RightLittleIntermediate,
  rightLittleDistal: VRMHumanBoneName.RightLittleDistal,
};

const POSE_BONE_SET: VRMHumanBoneName[] = [
  VRMHumanBoneName.Head,
  VRMHumanBoneName.Neck,
  VRMHumanBoneName.Spine,
  VRMHumanBoneName.Chest,
  VRMHumanBoneName.LeftShoulder,
  VRMHumanBoneName.RightShoulder,
  VRMHumanBoneName.LeftUpperArm,
  VRMHumanBoneName.RightUpperArm,
  VRMHumanBoneName.LeftLowerArm,
  VRMHumanBoneName.RightLowerArm,
  VRMHumanBoneName.LeftHand,
  VRMHumanBoneName.RightHand,
  VRMHumanBoneName.LeftThumbProximal,
  VRMHumanBoneName.RightThumbProximal,
];

function toQuat(e: PoseBoneEuler | [number, number, number]): Quaternion {
  return new Quaternion().setFromEuler(new Euler(e[0], e[1], e[2], "XYZ"));
}

const IDENTITY_QUAT = new Quaternion();

// Finger bones need faster convergence + amplitude boost (Kalidokit
// underestimates curl when the palm is oblique to camera).
const FINGER_BONE_PREFIX_RE = /^(left|right)(Thumb|Index|Middle|Ring|Little)/;
const FINGER_GAIN = 1.4;
const HALF_PI = Math.PI / 2;

function isFingerBone(name: string): boolean {
  return FINGER_BONE_PREFIX_RE.test(name);
}

export default function VRMAvatar({
  currentSign,
  captureClip,
  captureGloss,
  captureElapsedSec,
  captureNmm,
  onReady,
}: {
  currentSign: CurrentSign;
  captureClip: CaptureClip | null;
  captureGloss: string | null;
  captureElapsedSec: number;
  captureNmm?: "wh" | "neg" | "yn";
  onReady?: () => void;
}) {
  const gltf = useLoader(GLTFLoader, VRM_URL, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });
  const vrm = (gltf as unknown as { userData: { vrm: VRM } }).userData.vrm;

  const [ready, setReady] = useState(false);
  const posePoseRef = useRef<Pose>(poseFor("Idle"));
  const elapsedRef = useRef(0);
  const readyCbRef = useRef(onReady);
  readyCbRef.current = onReady;

  useEffect(() => {
    if (!vrm) return;
    vrm.scene.rotation.y = 0;
    setReady(true);
    readyCbRef.current?.();
  }, [vrm]);

  useEffect(() => {
    posePoseRef.current = currentSign
      ? poseFor(currentSign.entry.source)
      : poseFor("Idle");
    elapsedRef.current = 0;
  }, [currentSign]);

  useFrame((_, dt) => {
    if (!vrm || !ready) return;
    elapsedRef.current += dt;
    const bodySlerpT = MathUtils.clamp(dt * 14, 0, 1);
    const fingerSlerpT = MathUtils.clamp(dt * 40, 0, 1);

    if (captureClip) {
      // ===== Mocap capture playback path =====
      // Our ISLRTC captures have real FINGER data but missing body/arm data
      // (chest-up framing). So we layer sources per bone:
      //   1. mocap sample (fingers, mostly)
      //   2. per-sign hand-authored arm pose (arms in right place)
      //   3. REST_POSE (arms at sides) — final fallback
      const sampled = sampleClip(captureClip, captureElapsedSec);
      const nmmOffset = nmmFrameOffset(captureNmm, captureElapsedSec);
      const armPose = captureGloss ? armPoseFor(captureGloss) : REST_POSE;

      for (const llmName of Object.keys(LLM_BONE_TO_VRM) as BoneName[]) {
        const vrmName = LLM_BONE_TO_VRM[llmName];
        const node = vrm.humanoid.getNormalizedBoneNode(vrmName);
        if (!node) continue;
        const finger = isFingerBone(llmName);
        const slerpT = finger ? fingerSlerpT : bodySlerpT;
        // Mocap captures are in a frame rotated 180° around Y relative to the
        // front-facing avatar. Conjugate by Y-π: [x,y,z] → [-x,y,-z]. This
        // moves "hands curl behind body" → "hands curl toward camera".
        const rawMocap = sampled.get(llmName);
        const mocap: [number, number, number] | undefined = rawMocap
          ? [-rawMocap[0], rawMocap[1], -rawMocap[2]]
          : undefined;
        const arm = armPose[llmName];
        const nmmEuler = nmmOffset[vrmName as unknown as keyof typeof nmmOffset];

        // Prefer mocap (fingers), then per-sign arm pose, then identity.
        let base: [number, number, number] | null = mocap ?? arm ?? null;
        if (base && finger) {
          // Amplitude boost for finger Z (curl axis). Clamp so we don't
          // hyperextend beyond anatomical joint limits.
          base = [
            base[0],
            base[1],
            MathUtils.clamp(base[2] * FINGER_GAIN, -HALF_PI, HALF_PI),
          ];
        }

        if (base) {
          const final: [number, number, number] = nmmEuler
            ? [base[0] + nmmEuler[0], base[1] + nmmEuler[1], base[2] + nmmEuler[2]]
            : base;
          node.quaternion.slerp(toQuat(final), slerpT);
        } else if (nmmEuler) {
          node.quaternion.slerp(
            toQuat(nmmEuler as [number, number, number]),
            slerpT,
          );
        } else {
          node.quaternion.slerp(IDENTITY_QUAT, slerpT);
        }
      }
    } else {
      // ===== Pose-preset fallback path (rules engine) =====
      const nmm = currentSign?.token.nmm;
      const offset = nmmFrameOffset(nmm, elapsedRef.current);
      const pose = posePoseRef.current;

      for (const name of POSE_BONE_SET) {
        const node = vrm.humanoid.getNormalizedBoneNode(name);
        if (!node) continue;
        const target = pose[name];
        const offsetEuler = offset[name];
        const baseTarget: PoseBoneEuler = target ?? [0, 0, 0];
        const finalTarget: PoseBoneEuler = offsetEuler
          ? [
              baseTarget[0] + offsetEuler[0],
              baseTarget[1] + offsetEuler[1],
              baseTarget[2] + offsetEuler[2],
            ]
          : baseTarget;
        node.quaternion.slerp(toQuat(finalTarget), bodySlerpT);
      }
    }

    vrm.update(dt);
  });

  return <primitive object={vrm.scene} position={[0, -1.05, 0]} scale={1.05} />;
}

useLoader.preload(GLTFLoader, VRM_URL, (loader) => {
  loader.register((parser) => new VRMLoaderPlugin(parser));
});
