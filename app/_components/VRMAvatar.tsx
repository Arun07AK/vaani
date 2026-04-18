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
import { sampleSign } from "@/lib/animationPlayer";
import type { BoneName, SignAnim } from "@/lib/animationSpec";

const VRM_URL = "/avatars/vaani.vrm";

type CurrentSign = {
  token: GlossToken;
  entry: SignEntry;
} | null;

/**
 * Map from SPEC bone names (animationSpec.ts) to VRM enum values.
 * VRM enum uses the exact same camelCase strings so this is an identity map,
 * but we go through the enum to stay type-safe with @pixiv/three-vrm.
 */
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

export default function VRMAvatar({
  currentSign,
  llmSign,
  llmElapsedSec,
  onReady,
}: {
  currentSign: CurrentSign;
  llmSign: SignAnim | null;
  llmElapsedSec: number;
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
    const slerpT = MathUtils.clamp(dt * 6, 0, 1);

    if (llmSign) {
      // ===== LLM keyframe-driven path =====
      const tNorm = MathUtils.clamp(
        llmElapsedSec / (llmSign.durationMs / 1000),
        0,
        1,
      );
      const sampled = sampleSign(llmSign, tNorm);
      const nmmOffset = nmmFrameOffset(llmSign.nmm, llmElapsedSec);

      // Walk every humanoid bone; if present in sample, set; else slerp toward identity.
      for (const llmName of Object.keys(LLM_BONE_TO_VRM) as BoneName[]) {
        const vrmName = LLM_BONE_TO_VRM[llmName];
        const node = vrm.humanoid.getNormalizedBoneNode(vrmName);
        if (!node) continue;
        const euler = sampled.get(llmName);
        const nmmEuler = nmmOffset[vrmName as unknown as keyof typeof nmmOffset];
        if (euler) {
          const final: [number, number, number] = nmmEuler
            ? [euler[0] + nmmEuler[0], euler[1] + nmmEuler[1], euler[2] + nmmEuler[2]]
            : euler;
          node.quaternion.slerp(toQuat(final), slerpT);
        } else if (nmmEuler) {
          node.quaternion.slerp(toQuat(nmmEuler as [number, number, number]), slerpT);
        } else {
          // Relax toward T-pose identity for unaddressed bones.
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
        node.quaternion.slerp(toQuat(finalTarget), slerpT);
      }
    }

    vrm.update(dt);
  });

  return <primitive object={vrm.scene} position={[0, -1.05, 0]} scale={1.05} />;
}

useLoader.preload(GLTFLoader, VRM_URL, (loader) => {
  loader.register((parser) => new VRMLoaderPlugin(parser));
});
