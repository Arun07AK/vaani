"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { glossify } from "@/lib/glossify";
import { useMic } from "@/lib/useMic";
import {
  useGlossStore,
  useSignQueue,
  useTranscriptionStore,
} from "@/lib/stores/pipeline";

export default function MicControl() {
  const { isRecording, isBusy, error, start, stop, supported } = useMic();
  const transcript = useTranscriptionStore((s) => s.transcript);
  const setTokens = useGlossStore((s) => s.setTokens);
  const enqueueSigns = useSignQueue((s) => s.enqueue);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!transcript) return;
    const tokens = glossify(transcript);
    setTokens(tokens);
    enqueueSigns(tokens);
  }, [transcript, setTokens, enqueueSigns]);

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
          isRecording
            ? "animate-pulse ring-4 ring-violet-500/50"
            : "",
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
            : supported
              ? "hold to talk"
              : "mic unavailable — use the box below"}
      </p>

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
