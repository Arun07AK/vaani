import type { BoneName } from "./bones";

export type CaptureFrame = {
  time: number; // seconds from clip start
  bones: Partial<Record<BoneName, [number, number, number]>>;
};

export type CaptureClip = {
  gloss: string;
  fps: number;
  durationMs: number;
  frames: CaptureFrame[];
  source?: string;
  createdAt?: string;
};

const clipCache = new Map<string, CaptureClip>();

/** Fetch and memoize a capture clip JSON. Returns null on failure. */
export async function loadClip(url: string): Promise<CaptureClip | null> {
  const hit = clipCache.get(url);
  if (hit) return hit;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const clip = (await res.json()) as CaptureClip;
    if (!clip.frames?.length) return null;
    clipCache.set(url, clip);
    return clip;
  } catch {
    return null;
  }
}

/**
 * Sample a clip at elapsed time (seconds). Linearly interpolates between the
 * two surrounding frames per bone. Returns a map of active bones; absent
 * bones should relax to T-pose identity at the caller.
 */
export function sampleClip(
  clip: CaptureClip,
  elapsedSec: number,
): Map<BoneName, [number, number, number]> {
  const frames = clip.frames;
  const out = new Map<BoneName, [number, number, number]>();
  if (frames.length === 0) return out;
  const t = Math.max(0, Math.min(clip.durationMs / 1000, elapsedSec));

  // Find surrounding frames via binary search.
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time <= t) lo = mid;
    else hi = mid;
  }
  const a = frames[lo];
  const b = frames[hi];
  const span = b.time - a.time;
  const alpha = span > 1e-6 ? (t - a.time) / span : 0;

  const allBones = new Set<BoneName>([
    ...(Object.keys(a.bones) as BoneName[]),
    ...(Object.keys(b.bones) as BoneName[]),
  ]);
  for (const name of allBones) {
    const va = a.bones[name];
    const vb = b.bones[name];
    if (va && vb) {
      out.set(name, [
        lerp(va[0], vb[0], alpha),
        lerp(va[1], vb[1], alpha),
        lerp(va[2], vb[2], alpha),
      ]);
    } else if (va) {
      out.set(name, [va[0], va[1], va[2]]);
    } else if (vb) {
      out.set(name, [vb[0], vb[1], vb[2]]);
    }
  }
  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
