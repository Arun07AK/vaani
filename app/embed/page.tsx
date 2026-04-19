"use client";

import { useEffect } from "react";
import AvatarStage from "@/app/_components/AvatarStage";
import GlossOverlay from "@/app/_components/GlossOverlay";
import { useTranscriptionStore } from "@/lib/stores/pipeline";
import { useTranscriptPipeline } from "@/lib/useTranscriptPipeline";

/**
 * /embed — headless variant of the home page for the VAANI Chrome extension.
 * No header, no footer, no mic UI. Transcripts arrive via window.postMessage
 * from the extension's PiP window parent, which in turn receives them from
 * the offscreen document that captured tab audio.
 *
 * postMessage protocol:
 *   { type: "vaani.transcript", text: string }
 *   { type: "vaani.reset" }
 */
export default function EmbedPage() {
  const setTranscript = useTranscriptionStore((s) => s.setTranscript);

  // Drive the transcript → gloss → queue → avatar pipeline headlessly.
  useTranscriptPipeline();

  useEffect(() => {
    // Signal readiness to the parent.
    const signalReady = () => {
      try {
        window.parent?.postMessage({ type: "vaani.embed-ready" }, "*");
      } catch {
        // cross-origin failures are fine — the parent might not be waiting
      }
    };
    signalReady();
    const t = setTimeout(signalReady, 500);

    // #region agent log
    let _lastTranscript = "";
    let _msgCounter = 0;
    const _dbg = (location: string, message: string, data: unknown) => {
      try {
        fetch('http://127.0.0.1:7391/ingest/0ca204d3-54b2-4929-9009-05fc8cd40158', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '3103cc' },
          body: JSON.stringify({ sessionId: '3103cc', location, message, data, timestamp: Date.now() }),
        }).catch(() => {});
      } catch {}
    };
    // #endregion
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; text?: string } | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "vaani.transcript" && typeof data.text === "string") {
        const trimmed = data.text.trim();
        // #region agent log
        _msgCounter += 1;
        const isDup = trimmed === _lastTranscript;
        _dbg('embed/page.tsx:onMessage', 'transcript received', {
          counter: _msgCounter, len: trimmed.length, text: trimmed.slice(0, 120),
          isDuplicateOfPrevious: isDup, currentStoreTranscript: useTranscriptionStore.getState().transcript.slice(0, 120),
        });
        _lastTranscript = trimmed;
        // #endregion
        if (trimmed) {
          // Defend against React useEffect dep-equality skipping identical
          // consecutive transcripts (Whisper often returns repeated "you",
          // "thanks for watching", etc.). Append an invisible counter tag so
          // the store value differs and the pipeline always re-fires.
          const prev = useTranscriptionStore.getState().transcript;
          const stripped = prev.replace(/\u200b+$/, "");
          const tagged =
            trimmed === stripped ? `${trimmed}\u200b` : trimmed;
          setTranscript(tagged);
        }
      }
      if (data.type === "vaani.reset") {
        useTranscriptionStore.getState().reset();
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      clearTimeout(t);
      window.removeEventListener("message", onMessage);
    };
  }, [setTranscript]);

  return (
    <main className="flex h-screen w-screen flex-col items-center justify-center gap-2 bg-[#05050f] p-2 text-center">
      <div className="w-full flex-1">
        <AvatarStage />
      </div>
      <GlossOverlay />
    </main>
  );
}
