"use client";

import { useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
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
    lang,
    setLang,
  } = useSpeechASR();
  const [typed, setTyped] = useState("");

  // Drives transcript → gloss → queue → avatar. Lives here because MicControl
  // is already a client component mounted on the home page.
  useTranscriptPipeline();

  const submitTyped = () => {
    const value = typed.trim();
    if (!value) return;
    useTranscriptionStore.getState().setTranscript(value);
    setTyped("");
  };

  // Hold-to-talk: pointer down starts, pointer up/leave stops. Do NOT collapse
  // this to onClick — it's a behavior contract the rest of the app relies on.
  const handleMicDown = () => {
    if (!supported || isBusy) return;
    void start();
  };
  const handleMicUp = () => {
    if (!isRecording) return;
    stop();
  };

  const placeholder =
    lang === "hi-IN"
      ? "एंटर दबाकर साइन करें"
      : "press enter to sign";

  return (
    <footer
      className="grid items-center gap-6 border-t border-[color:var(--vaani-rule)] px-8"
      style={{ gridTemplateColumns: "64px 1fr auto" }}
    >
      {/* Mic — hold to talk, 52px violet-when-recording with pulse ring */}
      <div className="relative h-[52px] w-[52px] justify-self-start">
        <button
          type="button"
          onPointerDown={handleMicDown}
          onPointerUp={handleMicUp}
          onPointerLeave={handleMicUp}
          disabled={!supported || isBusy}
          aria-label={isRecording ? "Recording — release to stop" : "Hold to record"}
          aria-pressed={isRecording}
          className={[
            "relative z-[2] grid h-[52px] w-[52px] place-items-center rounded-full transition-colors",
            "border",
            isRecording
              ? "border-[color:var(--vaani-accent)] bg-[color:var(--vaani-accent)] text-white"
              : supported
                ? "border-[color:var(--vaani-rule)] bg-[color:var(--vaani-surface)] text-[color:var(--vaani-text)] hover:border-[color:var(--vaani-muted-2)]"
                : "cursor-not-allowed border-[color:var(--vaani-rule-2)] bg-[color:var(--vaani-surface-2)] text-[color:var(--vaani-muted-2)]",
            isBusy ? "cursor-wait" : supported ? "cursor-pointer" : "",
          ].join(" ")}
        >
          {isBusy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isRecording ? (
            <MicOff className="h-5 w-5" strokeWidth={1.75} />
          ) : supported ? (
            <Mic className="h-5 w-5" strokeWidth={1.75} />
          ) : (
            <MicOff className="h-5 w-5" strokeWidth={1.75} />
          )}
        </button>
        {isRecording && (
          <span
            aria-hidden
            className="vaani-pulse pointer-events-none absolute -inset-[6px] rounded-full border-2"
            style={{ borderColor: "var(--vaani-accent)" }}
          />
        )}
      </div>

      {/* Type input — underline only, no border elsewhere */}
      <input
        type="text"
        autoComplete="off"
        spellCheck={false}
        aria-label="Type text to sign"
        placeholder={placeholder}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submitTyped();
          }
        }}
        className={[
          "w-full bg-transparent py-[14px] font-sans text-[14px] leading-none outline-none",
          "border-0 border-b transition-colors",
          "placeholder:text-[color:var(--vaani-muted-2)]",
          typed.trim()
            ? "border-b-[color:var(--vaani-muted)] text-[color:var(--vaani-text)]"
            : "border-b-[color:var(--vaani-rule)] text-[color:var(--vaani-text)]",
          "focus:border-b-[color:var(--vaani-muted)]",
          lang === "hi-IN" ? "vaani-deva" : "",
        ].join(" ")}
      />

      {/* Language toggle — segmented, accent underline on active */}
      <div
        role="tablist"
        aria-label="Language"
        className="vaani-mono inline-flex gap-5 justify-self-end select-none text-[color:var(--vaani-muted)]"
      >
        {(["en-IN", "hi-IN"] as const).map((code) => {
          const active = lang === code;
          const label = code === "en-IN" ? "EN" : "हिं";
          return (
            <button
              key={code}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setLang(code as AsrLang)}
              className={[
                "cursor-pointer border-0 bg-transparent py-[6px] font-mono text-[11px] tracking-[0.02em] transition-colors",
                "border-b",
                active
                  ? "border-b-[color:var(--vaani-accent)] text-[color:var(--vaani-text)]"
                  : "border-b-transparent hover:text-[color:var(--vaani-text)]",
                code === "hi-IN" ? "vaani-deva" : "",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Error toast — appears in the top-left corner of the interaction row,
       * never blocks the layout. */}
      {error && (
        <div
          role="alert"
          className="vaani-mono pointer-events-none absolute left-8 -top-[42px] text-[color:var(--vaani-dot-err)]"
        >
          <span className="vaani-dot err mr-2" aria-hidden />
          {error.length > 80 ? error.slice(0, 80) + "…" : error}
        </div>
      )}
    </footer>
  );
}
