"use client";

import type { CaptureFrame } from "./retarget";

export type CaptureClip = {
  gloss: string;
  fps: number;
  durationMs: number;
  frames: CaptureFrame[];
  source?: string; // optional source video name
  createdAt: string;
};

export function buildClip(
  gloss: string,
  frames: CaptureFrame[],
  fps = 30,
  source?: string,
): CaptureClip {
  const startTime = frames[0]?.time ?? 0;
  const rebased = frames.map((f) => ({ ...f, time: f.time - startTime }));
  const durationMs =
    rebased.length === 0 ? 0 : Math.round((rebased[rebased.length - 1].time) * 1000);
  return {
    gloss: gloss.toUpperCase(),
    fps,
    durationMs,
    frames: rebased,
    source,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Triggers a browser download of the capture as JSON.
 * Only callable in the browser.
 */
export function downloadClip(clip: CaptureClip) {
  const blob = new Blob([JSON.stringify(clip)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${clip.gloss}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
