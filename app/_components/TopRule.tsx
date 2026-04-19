"use client";

import { useTranscriptionStore } from "@/lib/stores/pipeline";

function statusFor(
  engine: ReturnType<typeof useTranscriptionStore.getState>["engine"],
  isRecording: boolean,
  isGenerating: boolean,
  hasError: boolean,
) {
  if (hasError) return { dot: "err" as const, text: "error" };
  if (isRecording) return { dot: "info" as const, text: "listening · live" };
  if (isGenerating) return { dot: "info" as const, text: "resolving signs" };
  switch (engine) {
    case "mocap":
      return { dot: "ok" as const, text: "engine · mocap" };
    case "composition":
      return { dot: "info" as const, text: "engine · composition" };
    case "rules":
      return { dot: "warn" as const, text: "engine · rules" };
    case "idle":
    default:
      return { dot: "idle" as const, text: "ready" };
  }
}

export default function TopRule() {
  const engine = useTranscriptionStore((s) => s.engine);
  const isRecording = useTranscriptionStore((s) => s.isRecording);
  const isGenerating = useTranscriptionStore((s) => s.isGenerating);
  const error = useTranscriptionStore((s) => s.error);

  const { dot, text } = statusFor(engine, isRecording, isGenerating, !!error);

  return (
    <header
      className="grid items-center border-b border-[color:var(--vaani-rule)] px-8"
      style={{ gridTemplateColumns: "1fr auto" }}
    >
      <span
        className="font-sans text-[18px] font-medium tracking-[0.02em] text-[color:var(--vaani-text)]"
        style={{ lineHeight: 1 }}
      >
        VAANI
      </span>
      <span className="vaani-mono inline-flex items-center gap-[10px] text-[color:var(--vaani-muted)]">
        <span className={`vaani-dot ${dot}`} aria-hidden />
        <span>{text}</span>
      </span>
    </header>
  );
}
