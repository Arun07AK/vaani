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

type BatchItem = {
  file: File;
  gloss: string;
  status: "queued" | "processing" | "done" | "failed";
  frames?: number;
  error?: string;
};

function glossFromFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, "") // strip extension
    .replace(/[_\s]+/g, "-")
    .toUpperCase();
}

export default function CapturePage() {
  const [gloss, setGloss] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [clip, setClip] = useState<CaptureClip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useWebcam, setUseWebcam] = useState(false);

  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchActive, setBatchActive] = useState(false);
  const [batchIndex, setBatchIndex] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const framesRef = useRef<CaptureFrame[]>([]);
  const startTimeRef = useRef<number>(0);

  // --------- Single-file upload ---------
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (files.length > 1) {
      // Batch mode
      const items: BatchItem[] = Array.from(files).map((file) => ({
        file,
        gloss: glossFromFilename(file.name),
        status: "queued",
      }));
      setBatchItems(items);
      setBatchIndex(0);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
      setUseWebcam(false);
      setClip(null);
      setStatus("ready");
      setError(null);
      return;
    }

    const f = files[0];
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(f));
    setGloss(glossFromFilename(f.name));
    setUseWebcam(false);
    setClip(null);
    setStatus("ready");
    setError(null);
  };

  // --------- Webcam ---------
  const onWebcam = async () => {
    try {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
      setUseWebcam(true);
      setBatchItems([]);
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

  // --------- MediaPipe preload ---------
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

  // --------- Single capture run ---------
  const runSingleCapture = useCallback(
    async (glossLabel: string, videoSrc: File | null): Promise<CaptureClip | null> => {
      if (!videoRef.current) return null;
      const video = videoRef.current;

      if (videoSrc) {
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        const url = URL.createObjectURL(videoSrc);
        setVideoUrl(url);
        video.src = url;
        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => {
            video.removeEventListener("loadeddata", onLoaded);
            video.removeEventListener("error", onErr);
            resolve();
          };
          const onErr = () => {
            video.removeEventListener("loadeddata", onLoaded);
            video.removeEventListener("error", onErr);
            reject(new Error("video load failed"));
          };
          video.addEventListener("loadeddata", onLoaded);
          video.addEventListener("error", onErr);
        });
      }

      framesRef.current = [];
      startTimeRef.current = performance.now();

      const holistic = await createHolistic();
      holistic.onResults((results) => {
        const time = (performance.now() - startTimeRef.current) / 1000;
        const frame = retargetFrame(time, results, video);
        framesRef.current.push(frame);
        setProgress(framesRef.current.length);
      });

      video.currentTime = 0;
      await video.play();

      await new Promise<void>((resolve) => {
        const loop = async () => {
          if (!video || video.paused || video.ended) {
            resolve();
            return;
          }
          try {
            await holistic.send({ image: video });
          } catch (e) {
            console.warn("holistic.send failed", e);
          }
          setTimeout(loop, 33);
        };
        loop();
      });

      const builtClip = buildClip(glossLabel, framesRef.current, 30);
      return builtClip;
    },
    [videoUrl],
  );

  // --------- Webcam capture ---------
  const startWebcamCapture = useCallback(async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    framesRef.current = [];
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

    const loop = async () => {
      if (!video || video.paused || !video.srcObject) {
        setStatus("processing");
        const builtClip = buildClip(gloss || "UNNAMED", framesRef.current, 30);
        setClip(builtClip);
        setStatus("complete");
        return;
      }
      try {
        await holistic.send({ image: video });
      } catch (e) {
        console.warn(e);
      }
      setTimeout(loop, 33);
    };
    loop();
  }, [gloss]);

  const stopWebcamCapture = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const tracks = (v.srcObject as MediaStream | null)?.getTracks?.() ?? [];
    tracks.forEach((t) => t.stop());
    v.srcObject = null;
  }, []);

  // --------- Start (routes to single-file / batch / webcam) ---------
  const onStart = useCallback(async () => {
    setError(null);
    setProgress(0);

    // BATCH MODE
    if (batchItems.length > 0) {
      setBatchActive(true);
      setStatus("recording");
      for (let i = 0; i < batchItems.length; i++) {
        setBatchIndex(i);
        const item = batchItems[i];
        setBatchItems((prev) =>
          prev.map((p, idx) => (idx === i ? { ...p, status: "processing" } : p)),
        );
        try {
          const c = await runSingleCapture(item.gloss, item.file);
          if (c && c.frames.length > 0) {
            downloadClip(c);
            setBatchItems((prev) =>
              prev.map((p, idx) =>
                idx === i ? { ...p, status: "done", frames: c.frames.length } : p,
              ),
            );
          } else {
            setBatchItems((prev) =>
              prev.map((p, idx) =>
                idx === i ? { ...p, status: "failed", error: "no frames" } : p,
              ),
            );
          }
        } catch (err) {
          setBatchItems((prev) =>
            prev.map((p, idx) =>
              idx === i
                ? {
                    ...p,
                    status: "failed",
                    error: err instanceof Error ? err.message : "unknown",
                  }
                : p,
            ),
          );
        }
        // Brief pause so the download popup registers + MediaPipe resets
        await new Promise((r) => setTimeout(r, 400));
      }
      setBatchActive(false);
      setStatus("complete");
      return;
    }

    // SINGLE-FILE MODE
    if (!useWebcam && videoUrl) {
      if (!gloss.trim()) {
        setError("Enter a gloss name first");
        return;
      }
      setStatus("recording");
      const c = await runSingleCapture(gloss, null);
      if (c) {
        setClip(c);
        setStatus("complete");
      }
      return;
    }

    // WEBCAM MODE
    if (useWebcam) {
      if (!gloss.trim()) {
        setError("Enter a gloss name first");
        return;
      }
      await startWebcamCapture();
    }
  }, [batchItems, useWebcam, videoUrl, gloss, runSingleCapture, startWebcamCapture]);

  const onStop = useCallback(() => {
    if (useWebcam) stopWebcamCapture();
  }, [useWebcam, stopWebcamCapture]);

  const onDownload = () => {
    if (clip) downloadClip(clip);
  };

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-gradient-to-b from-[#0a0a1f] via-[#0d0d2a] to-black p-8 text-zinc-100">
      <h1 className="text-3xl font-semibold">VAANI · Capture Tool</h1>
      <p className="text-xs text-zinc-500 uppercase tracking-wider">
        video → MediaPipe Holistic → Kalidokit → VRM bones → JSON
      </p>

      <section className="flex w-full max-w-2xl flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-mono uppercase text-zinc-500">
            gloss {batchItems.length > 0 ? "(auto from filenames — batch mode)" : "(uppercase)"}
          </span>
          <input
            value={gloss}
            onChange={(e) => setGloss(e.target.value.toUpperCase())}
            disabled={batchItems.length > 0}
            placeholder="HELLO"
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm disabled:opacity-40"
          />
        </label>

        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800">
            <input
              type="file"
              accept="video/*"
              multiple
              onChange={onFile}
              className="hidden"
            />
            Upload video(s) — select multiple for batch mode
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
          controls={!useWebcam && batchItems.length === 0}
          muted
          playsInline
          autoPlay={useWebcam}
          className="w-full rounded-xl border border-zinc-800 bg-black"
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={onStart}
          disabled={status === "loading-holistic" || batchActive}
          className="rounded-full border border-violet-500 bg-violet-600 px-6 py-2 text-sm font-medium disabled:opacity-40"
        >
          {status === "loading-holistic"
            ? "Loading MediaPipe…"
            : batchActive
              ? `Processing ${batchIndex + 1}/${batchItems.length}…`
              : batchItems.length > 0
                ? `Start Batch (${batchItems.length} files)`
                : "Start Capture"}
        </button>
        {useWebcam && (
          <button
            onClick={onStop}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-6 py-2 text-sm font-medium"
          >
            Stop Webcam
          </button>
        )}
        {clip && !batchActive && (
          <button
            onClick={onDownload}
            className="rounded-full border border-emerald-500 bg-emerald-600 px-6 py-2 text-sm font-medium"
          >
            Download {clip.gloss}.json
          </button>
        )}
      </div>

      {batchItems.length > 0 && (
        <section className="w-full max-w-2xl rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
          <div className="mb-2 text-xs font-mono uppercase tracking-wider text-zinc-500">
            batch queue ({batchItems.filter((i) => i.status === "done").length}/
            {batchItems.length} complete)
          </div>
          <div className="space-y-1 text-xs">
            {batchItems.map((item, i) => (
              <div
                key={i}
                className={[
                  "flex items-center justify-between rounded px-2 py-1",
                  item.status === "done"
                    ? "bg-emerald-950/30 text-emerald-300"
                    : item.status === "processing"
                      ? "bg-violet-950/30 text-violet-300 animate-pulse"
                      : item.status === "failed"
                        ? "bg-red-950/30 text-red-300"
                        : "text-zinc-500",
                ].join(" ")}
              >
                <span className="font-mono">{item.gloss}</span>
                <span>
                  {item.status === "done" && `✓ ${item.frames} frames`}
                  {item.status === "processing" && "…"}
                  {item.status === "queued" && "queued"}
                  {item.status === "failed" && `✗ ${item.error ?? "failed"}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

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
        Batch: pick multiple video files at once, filename → gloss (e.g.{" "}
        <code className="rounded bg-zinc-800 px-1">HELLO.mp4</code> → gloss{" "}
        <code className="rounded bg-zinc-800 px-1">HELLO</code>). Each processed
        clip downloads automatically. After all downloads, move JSONs to{" "}
        <code className="rounded bg-zinc-800 px-1">public/signs/captures/</code>.
      </p>
    </main>
  );
}
