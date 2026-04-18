"use client";

import * as Kalidokit from "kalidokit";
import type { BoneName } from "@/lib/bones";
import type { HolisticResultsLike } from "./holistic";

export type CaptureFrame = {
  time: number; // seconds from capture start
  bones: Partial<Record<BoneName, [number, number, number]>>;
};

type XYZ = { x: number; y: number; z: number };

function vec(xyz: XYZ | undefined | null): [number, number, number] | null {
  if (!xyz) return null;
  return [clampAngle(xyz.x), clampAngle(xyz.y), clampAngle(xyz.z)];
}

function clampAngle(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n > Math.PI) return Math.PI;
  if (n < -Math.PI) return -Math.PI;
  return n;
}

/**
 * Converts a MediaPipe Holistic result into a dense VRM humanoid bone frame
 * using Kalidokit's PoseSolver + HandSolver. Faces are skipped for mocap
 * clips (NMMs are applied separately at playback time).
 */
export function retargetFrame(
  time: number,
  results: HolisticResultsLike,
  video: HTMLVideoElement | null,
): CaptureFrame {
  const bones: CaptureFrame["bones"] = {};

  // ---- Pose: body + arms (+ legs) ----
  if (results.poseLandmarks && results.poseWorldLandmarks) {
    const rigPose = Kalidokit.Pose.solve(
      results.poseWorldLandmarks as unknown as Kalidokit.TFVectorPose,
      results.poseLandmarks as unknown as Kalidokit.TFVectorPose,
      {
        runtime: "mediapipe",
        video: video ?? undefined,
        enableLegs: false,
        imageSize: null,
      } as Kalidokit.IPoseSolveOptions,
    );
    if (rigPose) {
      // Hips: rotation only (position is world-space and avatar is anchored).
      const hipsRot = rigPose.Hips?.rotation;
      if (hipsRot) {
        const v = vec(hipsRot as unknown as XYZ);
        if (v) bones.hips = v;
      }
      const spineV = vec(rigPose.Spine as XYZ | undefined);
      if (spineV) bones.spine = spineV;

      const lUpper = vec(rigPose.LeftUpperArm as XYZ | undefined);
      const rUpper = vec(rigPose.RightUpperArm as XYZ | undefined);
      const lLower = vec(rigPose.LeftLowerArm as XYZ | undefined);
      const rLower = vec(rigPose.RightLowerArm as XYZ | undefined);
      const lHand = vec(rigPose.LeftHand as XYZ | undefined);
      const rHand = vec(rigPose.RightHand as XYZ | undefined);
      if (lUpper) bones.leftUpperArm = lUpper;
      if (rUpper) bones.rightUpperArm = rUpper;
      if (lLower) bones.leftLowerArm = lLower;
      if (rLower) bones.rightLowerArm = rLower;
      if (lHand) bones.leftHand = lHand;
      if (rHand) bones.rightHand = rHand;
    }
  }

  // ---- Left hand fingers ----
  if (results.leftHandLandmarks) {
    const rig = Kalidokit.Hand.solve(
      results.leftHandLandmarks as unknown as Kalidokit.Results,
      "Left",
    );
    if (rig) applyHandFingers(bones, rig, "left");
  }
  // ---- Right hand fingers ----
  if (results.rightHandLandmarks) {
    const rig = Kalidokit.Hand.solve(
      results.rightHandLandmarks as unknown as Kalidokit.Results,
      "Right",
    );
    if (rig) applyHandFingers(bones, rig, "right");
  }

  return { time, bones };
}

function applyHandFingers(
  bones: CaptureFrame["bones"],
  rig: Record<string, XYZ>,
  side: "left" | "right",
) {
  // Kalidokit field naming (VRM-style): LeftThumbProximal etc.
  // It returns keys like "LeftThumbProximal", "LeftIndexProximal", etc.
  // We remap to our lowerCamelCase BoneName enum.
  const prefix = side === "left" ? "Left" : "Right";
  const baseName = side === "left" ? "left" : "right";
  const fingers = [
    "Thumb",
    "Index",
    "Middle",
    "Ring",
    "Little",
  ] as const;
  const segments = ["Proximal", "Intermediate", "Distal"] as const;
  for (const finger of fingers) {
    for (const seg of segments) {
      const k = `${prefix}${finger}${seg}`;
      const v = vec(rig[k]);
      if (!v) continue;
      const myKey = `${baseName}${finger}${seg}` as BoneName;
      bones[myKey] = v;
    }
  }
}
