"use client";

import { useEffect, useRef, useState } from "react";
import AvatarStage from "./AvatarStage";
import {
  useCaptureQueue,
  useTranscriptionStore,
} from "@/lib/stores/pipeline";

function useClock(running: boolean) {
  const [label, setLabel] = useState("00:00");
  const startedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      startedRef.current = null;
      setLabel("00:00");
      return;
    }
    startedRef.current = performance.now();
    const interval = window.setInterval(() => {
      if (startedRef.current == null) return;
      const secs = Math.floor((performance.now() - startedRef.current) / 1000);
      const m = String(Math.floor(secs / 60)).padStart(2, "0");
      const s = String(secs % 60).padStart(2, "0");
      setLabel(`${m}:${s}`);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [running]);

  return label;
}

export default function AvatarCell() {
  const isRecording = useTranscriptionStore((s) => s.isRecording);
  const isGenerating = useTranscriptionStore((s) => s.isGenerating);
  const current = useCaptureQueue((s) => s.current);

  const busy = isRecording || isGenerating || !!current;
  const clock = useClock(busy);

  const mode = isRecording
    ? "listening"
    : current
      ? "signing"
      : isGenerating
        ? "resolving"
        : "idle";

  return (
    <section className="grid place-items-center min-h-0">
      <div
        className="relative aspect-square w-full overflow-hidden rounded-[12px] border border-[color:var(--vaani-rule)] bg-[#08080b]"
        style={{ maxWidth: 520, maxHeight: 520 }}
        aria-label="3D avatar canvas"
      >
        {/* Corner ticks — drawn from rules, not decoration */}
        <span
          className="absolute -left-px -top-px h-[10px] w-[10px] border-l border-t"
          style={{ borderColor: "var(--vaani-rule-2)" }}
          aria-hidden
        />
        <span
          className="absolute -right-px -top-px h-[10px] w-[10px] border-r border-t"
          style={{ borderColor: "var(--vaani-rule-2)" }}
          aria-hidden
        />
        <span
          className="absolute -bottom-px -left-px h-[10px] w-[10px] border-b border-l"
          style={{ borderColor: "var(--vaani-rule-2)" }}
          aria-hidden
        />
        <span
          className="absolute -bottom-px -right-px h-[10px] w-[10px] border-b border-r"
          style={{ borderColor: "var(--vaani-rule-2)" }}
          aria-hidden
        />

        {/* Top meta row — 3d info + running clock */}
        <div
          className="vaani-mono pointer-events-none absolute left-0 right-0 top-0 z-10 grid items-center px-4 pt-[14px] text-[color:var(--vaani-muted-2)]"
          style={{ gridTemplateColumns: "1fr auto" }}
        >
          <span>three.js · 520 × 520 · 60fps</span>
          <span>{clock}</span>
        </div>

        {/* The actual R3F canvas fills the frame. */}
        <div className="absolute inset-0">
          <AvatarStage />
        </div>

        {/* Bottom meta row — current mode + rig label */}
        <div
          className="vaani-mono pointer-events-none absolute bottom-0 left-0 right-0 z-10 grid items-center px-4 pb-[14px] text-[color:var(--vaani-muted-2)]"
          style={{ gridTemplateColumns: "1fr auto" }}
        >
          <span>{mode}</span>
          <span>rig · vaani-01</span>
        </div>
      </div>
    </section>
  );
}
