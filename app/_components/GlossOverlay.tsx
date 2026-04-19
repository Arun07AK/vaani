"use client";

import { useEffect, useRef } from "react";
import {
  useCaptureQueue,
  useGlossStore,
  useTranscriptionStore,
} from "@/lib/stores/pipeline";
import { useSpeechASR } from "@/lib/useSpeech";

function stripFingerspellBracket(gloss: string): string {
  // Fingerspelled items have gloss like "FRIEND[F]" for one letter of FRIEND.
  // For the chip row we want just the word.
  const bracket = gloss.indexOf("[");
  return bracket > 0 ? gloss.slice(0, bracket) : gloss;
}

type Chip = { text: string; tone: "past" | "now" | "next"; key: string };

export default function GlossOverlay() {
  const tokens = useGlossStore((s) => s.tokens);
  const current = useCaptureQueue((s) => s.current);
  const queue = useCaptureQueue((s) => s.queue);
  const transcript = useTranscriptionStore((s) => s.transcript);
  const { lang } = useSpeechASR();

  // Keep the last-played gloss so the row can show one "past" chip,
  // matching the design brief (1 past · current · next 3).
  const lastPlayedRef = useRef<string | null>(null);
  const lastCurrentKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const prevKey = lastCurrentKeyRef.current;
    if (current && prevKey && prevKey !== current.gloss) {
      lastPlayedRef.current = stripFingerspellBracket(prevKey);
    }
    lastCurrentKeyRef.current = current?.gloss ?? null;
  }, [current]);

  const chips: Chip[] = [];
  if (current) {
    if (lastPlayedRef.current) {
      chips.push({
        text: lastPlayedRef.current,
        tone: "past",
        key: `past-${lastPlayedRef.current}`,
      });
    }
    chips.push({
      text: stripFingerspellBracket(current.gloss),
      tone: "now",
      key: `now-${current.gloss}`,
    });
    queue.slice(0, 3).forEach((item, i) => {
      chips.push({
        text: stripFingerspellBracket(item.gloss),
        tone: "next",
        key: `next-${i}-${item.gloss}`,
      });
    });
  } else if (tokens.length > 0) {
    tokens.slice(0, 4).forEach((t, i) => {
      chips.push({ text: t.text, tone: "next", key: `tok-${i}-${t.text}` });
    });
  } else if (transcript) {
    // Transcript just landed; gloss not yet resolved — show a placeholder chip.
    chips.push({ text: "resolving", tone: "next", key: "resolving" });
  }

  const devaClass = lang === "hi-IN" ? "vaani-deva" : "";

  return (
    <section
      className="relative flex items-center overflow-hidden border-b border-t border-[color:var(--vaani-rule)] px-8"
      aria-label="Current sign sequence"
    >
      <div className="flex items-center gap-5">
        {chips.length === 0 ? (
          <span
            className={`vaani-mono text-[14px] text-[color:var(--vaani-muted-2)] ${devaClass}`}
            style={{ opacity: 0.55 }}
          >
            press the mic or type to begin
          </span>
        ) : (
          chips.map((chip, i) => (
            <span key={chip.key} className="flex items-center gap-5">
              {i > 0 && (
                <span
                  className="vaani-mono select-none text-[color:var(--vaani-rule)]"
                  style={{ fontSize: 14 }}
                  aria-hidden
                >
                  ·
                </span>
              )}
              <span
                className={[
                  "vaani-mono whitespace-nowrap transition-[color,opacity] duration-150",
                  devaClass,
                  chip.tone === "now"
                    ? "text-[color:var(--vaani-accent-400)]"
                    : chip.tone === "past"
                      ? "text-[color:var(--vaani-muted-2)] opacity-40"
                      : "text-[color:var(--vaani-muted-2)]",
                ].join(" ")}
                style={{ fontSize: 14, letterSpacing: "0.02em" }}
              >
                {chip.text}
              </span>
            </span>
          ))
        )}
      </div>
    </section>
  );
}
