"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VRMLoaderPlugin,
  VRMHumanBoneName,
  type VRM,
} from "@pixiv/three-vrm";
import { Euler, MathUtils, Quaternion } from "three";
import { nmmFrameOffset, poseFor, type BoneEuler, type Pose } from "@/lib/vrmPoses";
import type { GlossToken } from "@/lib/stores/pipeline";
import type { SignEntry } from "@/lib/lexicon";

const VRM_URL = "/avatars/vaani.vrm";

type CurrentSign = {
  token: GlossToken;
  entry: SignEntry;
} | null;

const BONE_NAMES: VRMHumanBoneName[] = [
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

function toQuat(e: BoneEuler): Quaternion {
  return new Quaternion().setFromEuler(new Euler(e[0], e[1], e[2], "XYZ"));
}

export default function VRMAvatar({
  currentSign,
  onReady,
}: {
  currentSign: CurrentSign;
  onReady?: () => void;
}) {
  const gltf = useLoader(GLTFLoader, VRM_URL, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });
  const vrm = (gltf as unknown as { userData: { vrm: VRM } }).userData.vrm;

  const [ready, setReady] = useState(false);
  const targetPoseRef = useRef<Pose>(poseFor("Idle"));
  const elapsedRef = useRef(0);
  const readyCbRef = useRef(onReady);
  readyCbRef.current = onReady;

  useEffect(() => {
    if (!vrm) return;
    // Face the camera (VRM default faces -Z).
    vrm.scene.rotation.y = Math.PI;
    // Prepare all relevant bone refs — they are normalized humanoid nodes.
    setReady(true);
    readyCbRef.current?.();
  }, [vrm]);

  useEffect(() => {
    targetPoseRef.current = currentSign
      ? poseFor(currentSign.entry.source)
      : poseFor("Idle");
    elapsedRef.current = 0;
  }, [currentSign]);

  useFrame((_, dt) => {
    if (!vrm || !ready) return;
    elapsedRef.current += dt;
    const nmm = currentSign?.token.nmm;
    const offset = nmmFrameOffset(nmm, elapsedRef.current);

    for (const name of BONE_NAMES) {
      const node = vrm.humanoid.getNormalizedBoneNode(name);
      if (!node) continue;
      const target = targetPoseRef.current[name];
      const offsetEuler = offset[name];
      const baseTarget: BoneEuler = target ?? [0, 0, 0];
      const finalTarget: BoneEuler = offsetEuler
        ? [
            baseTarget[0] + offsetEuler[0],
            baseTarget[1] + offsetEuler[1],
            baseTarget[2] + offsetEuler[2],
          ]
        : baseTarget;
      const targetQ = toQuat(finalTarget);
      node.quaternion.slerp(targetQ, MathUtils.clamp(dt * 6, 0, 1));
    }
    vrm.update(dt);
  });

  return <primitive object={vrm.scene} position={[0, -1.1, 0]} scale={1} />;
}

// Preload so the resource is in-flight as early as possible.
useLoader.preload(GLTFLoader, VRM_URL, (loader) => {
  loader.register((parser) => new VRMLoaderPlugin(parser));
});
