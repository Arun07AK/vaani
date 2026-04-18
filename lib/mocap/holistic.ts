"use client";

/**
 * MediaPipe Holistic wrapper.
 *
 * Loaded dynamically (client-only) because the npm package ships a UMD bundle
 * that touches `window` on import and breaks Next.js SSR / Turbopack builds.
 */

export type HolisticResultsLike = {
  poseLandmarks?: Array<{ x: number; y: number; z: number; visibility?: number }>;
  poseWorldLandmarks?: Array<{ x: number; y: number; z: number; visibility?: number }>;
  faceLandmarks?: Array<{ x: number; y: number; z: number }>;
  leftHandLandmarks?: Array<{ x: number; y: number; z: number }>;
  rightHandLandmarks?: Array<{ x: number; y: number; z: number }>;
};

type HolisticCtor = new (opts: { locateFile: (file: string) => string }) => HolisticInstance;

type HolisticInstance = {
  setOptions: (opts: {
    modelComplexity?: 0 | 1 | 2;
    smoothLandmarks?: boolean;
    enableSegmentation?: boolean;
    refineFaceLandmarks?: boolean;
    minDetectionConfidence?: number;
    minTrackingConfidence?: number;
  }) => void;
  onResults: (cb: (r: HolisticResultsLike) => void) => void;
  send: (input: { image: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement }) => Promise<void>;
  close: () => Promise<void>;
};

const CDN_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629";

let cached: HolisticInstance | null = null;
let cachedPromise: Promise<HolisticInstance> | null = null;

export async function createHolistic(): Promise<HolisticInstance> {
  if (cached) return cached;
  if (cachedPromise) return cachedPromise;

  cachedPromise = (async () => {
    // Dynamic import keeps this out of the SSR graph.
    const mod = (await import("@mediapipe/holistic")) as unknown as {
      Holistic: HolisticCtor;
    };
    const holistic = new mod.Holistic({
      locateFile: (file) => `${CDN_BASE}/${file}`,
    });
    holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      refineFaceLandmarks: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    cached = holistic;
    return holistic;
  })();
  return cachedPromise;
}

export async function disposeHolistic() {
  if (cached) {
    try {
      await cached.close();
    } catch {
      // ignore
    }
    cached = null;
    cachedPromise = null;
  }
}

/** Feed a single video frame; returns the results via the onResults callback. */
export async function processFrame(
  holistic: HolisticInstance,
  video: HTMLVideoElement,
): Promise<void> {
  await holistic.send({ image: video });
}
