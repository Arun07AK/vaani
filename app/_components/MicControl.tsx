"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff, Loader2, Sparkles } from "lucide-react";
import { glossify } from "@/lib/glossify";
import { loadLexicon, resolveSign } from "@/lib/lexicon";
import { useSpeechASR } from "@/lib/useSpeech";
import { loadCaptureManifest, lookupCapture } from "@/lib/captureLookup";
import {
  useCaptureQueue,
  useGlossStore,
  useSignQueue,
  useTranscriptionStore,
  type CaptureQueueItem,
} from "@/lib/stores/pipeline";

export default function MicControl() {
  const { isRecording, isBusy, error, start, stop, supported, engine } =
    useSpeechASR();
  const transcript = useTranscriptionStore((s) => s.transcript);
  const isGenerating = useTranscriptionStore((s) => s.isGenerating);
  const activeEngine = useTranscriptionStore((s) => s.engine);
  const setGenerating = useTranscriptionStore((s) => s.setGenerating);
  const setEngine = useTranscriptionStore((s) => s.setEngine);
  const setTokens = useGlossStore((s) => s.setTokens);
  const enqueueSigns = useSignQueue((s) => s.enqueue);
  const enqueueCapture = useCaptureQueue((s) => s.enqueue);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!transcript) return;
    let cancelled = false;

    const run = async () => {
      setGenerating(true);

      // 1. glossify English → ISL tokens.
      const baseTokens = glossify(transcript);

      // 2. resolve OOV flags via lexicon (best-effort).
      let tokens = baseTokens;
      try {
        const lexicon = await loadLexicon();
        tokens = baseTokens.map((token) => ({
          ...token,
          isOOV: resolveSign(token, lexicon).isOOV,
        }));
      } catch {
        // fall back to unannotated tokens
      }
      if (cancelled) {
        setGenerating(false);
        return;
      }
      setTokens(tokens);

      // 3. bucket tokens: captured → capture queue, uncaptured → rules queue.
      const manifest = await loadCaptureManifest();
      if (cancelled) {
        setGenerating(false);
        return;
      }

      const captureItems: CaptureQueueItem[] = [];
      const fallbackTokens: typeof tokens = [];
      let anyCapture = false;

      for (const token of tokens) {
        const url = lookupCapture(token.text, manifest);
        if (url) {
          anyCapture = true;
          captureItems.push({
            gloss: token.text,
            captureUrl: url,
            nmm: token.nmm,
            durationMs: 1400,
          });
        } else {
          // still add a placeholder so queue pacing works across the whole sentence.
          captureItems.push({
            gloss: token.text,
            captureUrl: null,
            nmm: token.nmm,
            durationMs: 1100,
          });
          fallbackTokens.push(token);
        }
      }

      // If we have any captures, drive the capture queue (it handles per-item
      // fallback to pose-preset internally — captureClip=null + pose still runs).
      // If NO captures available at all, go pure rules path.
      if (anyCapture) {
        enqueueCapture(captureItems);
        setEngine("mocap");
      } else {
        enqueueSigns(tokens);
        setEngine("rules");
      }
      setGenerating(false);
    };

    void run();

    return () => {
      cancelled = true;
      setGenerating(false);
    };
  }, [
    transcript,
    setTokens,
    enqueueSigns,
    enqueueCapture,
    setEngine,
    setGenerating,
  ]);

  const submitTyped = () => {
    const value = typed.trim();
    if (!value) return;
    useTranscriptionStore.getState().setTranscript(value);
    setTyped("");
  };

  const handleMicDown = () => {
    if (!supported || isBusy) return;
    void start();
  };
  const handleMicUp = () => {
    if (!isRecording) return;
    stop();
  };

  return (
    <section className="flex w-full max-w-2xl flex-col items-center gap-4">
      <button
        type="button"
        onPointerDown={handleMicDown}
        onPointerUp={handleMicUp}
        onPointerLeave={handleMicUp}
        disabled={!supported || isBusy}
        aria-pressed={isRecording}
        className={[
          "group relative flex h-20 w-20 items-center justify-center rounded-full border transition",
          supported
            ? "border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20"
            : "border-zinc-800 bg-zinc-900 opacity-60",
          isRecording ? "animate-pulse ring-4 ring-violet-500/50" : "",
          isBusy ? "cursor-wait" : "cursor-pointer",
        ].join(" ")}
      >
        {isBusy ? (
          <Loader2 className="h-8 w-8 animate-spin text-violet-300" />
        ) : isRecording ? (
          <MicOff className="h-8 w-8 text-red-400" />
        ) : supported ? (
          <Mic className="h-8 w-8 text-violet-300" />
        ) : (
          <MicOff className="h-8 w-8 text-zinc-500" />
        )}
      </button>

      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
        {isRecording
          ? "recording — release to transcribe"
          : isBusy
            ? "transcribing…"
            : isGenerating
              ? "resolving signs…"
              : supported
                ? `hold to talk · ${engine === "web-speech" ? "web speech" : "whisper"}`
                : "mic unavailable — use the box below"}
      </p>

      {activeEngine !== "idle" && !isGenerating && (
        <div
          className={[
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider",
            activeEngine === "mocap"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-300",
          ].join(" ")}
        >
          <Sparkles className="h-3 w-3" />
          {activeEngine === "mocap" ? "real motion capture" : "rules fallback"}
        </div>
      )}

      <div className="flex w-full flex-col items-stretch gap-2 text-left">
        <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          or type instead (Enter to submit)
        </label>
        <textarea
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submitTyped();
            }
          }}
          rows={2}
          placeholder='"Thank you my friend" · "What is your name?" · "I want water"'
          className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
        />
      </div>

      {transcript && (
        <div className="w-full rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-left text-sm text-zinc-300">
          <span className="mr-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            transcript
          </span>
          {transcript}
        </div>
      )}

      {error && (
        <div className="w-full rounded-lg border border-red-900 bg-red-950/30 p-3 text-left text-xs text-red-300">
          {error}
        </div>
      )}
    </section>
  );
}
