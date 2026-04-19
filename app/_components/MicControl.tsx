"use client";

import { useState } from "react";
import { Mic, MicOff, Loader2, Sparkles } from "lucide-react";
import { useSpeechASR, type AsrLang } from "@/lib/useSpeech";
import { useTranscriptPipeline } from "@/lib/useTranscriptPipeline";
import { useTranscriptionStore } from "@/lib/stores/pipeline";

export default function MicControl() {
  const {
    isRecording,
    isBusy,
    error,
    start,
    stop,
    supported,
    engine,
    lang,
    setLang,
  } = useSpeechASR();
  const transcript = useTranscriptionStore((s) => s.transcript);
  const isGenerating = useTranscriptionStore((s) => s.isGenerating);
  const activeEngine = useTranscriptionStore((s) => s.engine);
  const [typed, setTyped] = useState("");

  useTranscriptPipeline();

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
      <div className="flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950/60 p-1 text-[11px] font-mono uppercase tracking-wider">
        {(["en-IN", "hi-IN"] as const).map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code as AsrLang)}
            className={[
              "rounded-full px-3 py-1 transition",
              lang === code
                ? "bg-violet-500/30 text-violet-100"
                : "text-zinc-500 hover:text-zinc-200",
            ].join(" ")}
          >
            {code === "en-IN" ? "EN" : "हिं"}
          </button>
        ))}
      </div>

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
          ? `recording \u00b7 ${lang === "hi-IN" ? "\u0939\u093f\u0902\u0926\u0940" : "EN"}`
          : isBusy
            ? "transcribing\u2026"
            : isGenerating
              ? "resolving signs\u2026"
              : supported
                ? `hold to talk \u00b7 ${engine === "web-speech" ? "web speech" : "whisper"}`
                : "mic unavailable \u2014 use the box below"}
      </p>

      {activeEngine !== "idle" && !isGenerating && (
        <div className="flex items-center gap-2">
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
        </div>
      )}

      <div className="flex w-full flex-col items-stretch gap-2 text-left">
        <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          or type instead (Enter to submit) {"\u2014"} {lang === "hi-IN" ? "Hindi or English" : "English"}
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
          placeholder={
            lang === "hi-IN"
              ? "\u0906\u092a\u0915\u093e \u0928\u093e\u092e \u0915\u094d\u092f\u093e \u0939\u0948? \u00b7 \u092e\u0941\u091d\u0947 \u092a\u093e\u0928\u0940 \u091a\u093e\u0939\u093f\u090f"
              : '"Thank you my friend" \u00b7 "What is your name?" \u00b7 "I want water"'
          }
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
