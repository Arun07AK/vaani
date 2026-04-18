import type { BoneName, SignAnim } from "./animationSpec";

export type BoneEuler = [number, number, number];

/**
 * Sample the bone Eulers at a given normalized time t ∈ [0,1] within a sign.
 * Returns only the bones that appear anywhere in the sign; callers should
 * interpret absent bones as "relax to T-pose" (i.e., slerp toward identity).
 *
 * Behavior per bone:
 * - If bone is in the surrounding keyframes A (prev) and B (next): lerp(A,B, alpha).
 * - If only in A (held): return A.
 * - If only in B (not yet held): return B.
 * This keeps forward-fill behavior intuitive when the LLM only names a bone once.
 */
export function sampleSign(sign: SignAnim, tNorm: number): Map<BoneName, BoneEuler> {
  const t = clamp01(tNorm);
  const frames = sign.keyframes;
  if (frames.length === 0) return new Map();

  // Find surrounding frames: last with frame.t <= t, and first with frame.t >= t.
  let prevIdx = 0;
  let nextIdx = frames.length - 1;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].t <= t) prevIdx = i;
  }
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i].t >= t) nextIdx = i;
  }
  const prev = frames[prevIdx];
  const next = frames[nextIdx];
  const alpha =
    prev === next || next.t === prev.t
      ? 0
      : (t - prev.t) / (next.t - prev.t);

  const out = new Map<BoneName, BoneEuler>();

  const allBones = new Set<BoneName>([
    ...(Object.keys(prev.bones) as BoneName[]),
    ...(Object.keys(next.bones) as BoneName[]),
  ]);

  for (const name of allBones) {
    const a = prev.bones[name];
    const b = next.bones[name];
    if (a && b) {
      out.set(name, [
        lerp(a[0], b[0], alpha),
        lerp(a[1], b[1], alpha),
        lerp(a[2], b[2], alpha),
      ]);
    } else if (a) {
      out.set(name, [a[0], a[1], a[2]]);
    } else if (b) {
      out.set(name, [b[0], b[1], b[2]]);
    }
  }
  return out;
}

/** Union of every bone named in the sign — lets the renderer know which bones
 *  to actively drive (versus letting them relax to T-pose). */
export function activeBones(sign: SignAnim): Set<BoneName> {
  const out = new Set<BoneName>();
  for (const frame of sign.keyframes) {
    for (const name of Object.keys(frame.bones) as BoneName[]) out.add(name);
  }
  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
