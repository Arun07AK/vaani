"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createHolistic } from "@/lib/mocap/holistic";
import { retargetFrame, type CaptureFrame } from "@/lib/mocap/retarget";
import { buildClip, downloadClip, type CaptureClip } from "@/lib/mocap/capture";

type Status =
  | "idle"
  | "loading-holistic"
  | "ready"
  | "recording"
  | "processing"
  | "complete"
  | "error";

export default function CapturePage() {
  const [gloss, setGloss] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [clip, setClip] = useState<CaptureClip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useWebcam, setUseWebcam] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const framesRef = useRef<CaptureFrame[]>([]);
  const startTimeRef = useRef<number>(0);

  // File upload
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(f));
    setUseWebcam(false);
    setClip(null);
    setStatus("idle");
    setError(null);
  };

  // Webcam
  const onWebcam = async () => {
    try {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
      setUseWebcam(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "webcam failed");
      setStatus("error");
    }
  };

  // Precreate MediaPipe Holistic
  useEffect(() => {
    let cancelled = false;
    setStatus("loading-holistic");
    createHolistic()
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "MediaPipe load failed");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startCapture = useCallback(async () => {
    if (!gloss.trim()) {
      setError("Enter a gloss name first");
      return;
    }
    if (!videoRef.current) return;
    const video = videoRef.current;
    framesRef.current = [];
    setError(null);
    setProgress(0);
    setStatus("recording");
    startTimeRef.current = performance.now();

    const holistic = await createHolistic();
    holistic.onResults((results) => {
      const time = (performance.now() - startTimeRef.current) / 1000;
      const frame = retargetFrame(time, results, video);
      framesRef.current.push(frame);
      setProgress(framesRef.current.length);
    });

    // If file video: play & step through. If webcam: stream continuously until user stops.
    if (!useWebcam) {
      video.currentTime = 0;
      await video.play();
    }

    const loop = async () => {
      if (!video || video.paused || video.ended) {
        await finalize();
        return;
      }
      try {
        await holistic.send({ image: video });
      } catch (e) {
        setError(e instanceof Error ? e.message : "holistic.send failed");
      }
      // Target ~30fps processing
      setTimeout(loop, 33);
    };
    loop();
  }, [gloss, useWebcam]);

  const stopCapture = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (useWebcam) {
      // webcam doesn't "end"; signal end manually
      const tracks = (v.srcObject as MediaStream | null)?.getTracks?.() ?? [];
      tracks.forEach((t) => t.stop());
      v.srcObject = null;
    } else {
      v.pause();
    }
  }, [useWebcam]);

  const finalize = useCallback(async () => {
    setStatus("processing");
    const clip = buildClip(gloss, framesRef.current, 30);
    setClip(clip);
    setStatus("complete");
  }, [gloss]);

  const onDownload = () => {
    if (clip) downloadClip(clip);
  };

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-gradient-to-b from-[#0a0a1f] via-[#0d0d2a] to-black p-8 text-zinc-100">
      <h1 className="text-3xl font-semibold">VAANI · Capture Tool</h1>
      <p className="text-xs text-zinc-500 uppercase tracking-wider">
        record an ISL sign → MediaPipe Holistic → Kalidokit → VRM bones → JSON
      </p>

      <section className="flex w-full max-w-2xl flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-mono uppercase text-zinc-500">
            gloss (uppercase, matches lexicon)
          </span>
          <input
            value={gloss}
            onChange={(e) => setGloss(e.target.value.toUpperCase())}
            placeholder="HELLO"
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          />
        </label>

        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800">
            <input
              type="file"
              accept="video/*"
              onChange={onFile}
              className="hidden"
            />
            Upload video file
          </label>
          <button
            onClick={onWebcam}
            className="rounded border border-violet-700 bg-violet-900/30 px-3 py-2 text-sm hover:bg-violet-800/40"
          >
            Use webcam
          </button>
        </div>
      </section>

      <div className="relative w-full max-w-2xl">
        <video
          ref={videoRef}
          src={videoUrl ?? undefined}
          controls={!useWebcam}
          muted
          playsInline
          autoPlay={useWebcam}
          className="w-full rounded-xl border border-zinc-800 bg-black"
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={startCapture}
          disabled={status === "loading-holistic" || status === "recording"}
          className="rounded-full border border-violet-500 bg-violet-600 px-6 py-2 text-sm font-medium disabled:opacity-40"
        >
          {status === "loading-holistic" ? "Loading MediaPipe…" : "Start Capture"}
        </button>
        <button
          onClick={stopCapture}
          disabled={status !== "recording"}
          className="rounded-full border border-zinc-700 bg-zinc-900 px-6 py-2 text-sm font-medium disabled:opacity-40"
        >
          Stop
        </button>
        {clip && (
          <button
            onClick={onDownload}
            className="rounded-full border border-emerald-500 bg-emerald-600 px-6 py-2 text-sm font-medium"
          >
            Download {clip.gloss}.json
          </button>
        )}
      </div>

      <div className="w-full max-w-2xl rounded-lg border border-zinc-800 bg-zinc-950/70 p-4 text-xs text-zinc-400">
        <div>status: {status}</div>
        <div>frames captured: {progress}</div>
        {clip && (
          <>
            <div>gloss: {clip.gloss}</div>
            <div>duration: {clip.durationMs}ms</div>
            <div>frames: {clip.frames.length}</div>
          </>
        )}
        {error && <div className="mt-2 text-red-400">error: {error}</div>}
      </div>

      <p className="max-w-2xl text-xs text-zinc-500">
        Tip: record each sign as its own 1.5–2.5s clip. After download, save to{" "}
        <code className="rounded bg-zinc-800 px-1">public/signs/captures/{"<GLOSS>"}.json</code>{" "}
        and update <code className="rounded bg-zinc-800 px-1">manifest.json</code>.
      </p>
    </main>
  );
}
