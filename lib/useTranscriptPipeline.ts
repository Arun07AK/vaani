"use client";

import { useEffect } from "react";
import { glossify } from "./glossify";
import { glossifyViaLlm } from "./glossifyLlm";
import { loadLexicon, resolveSign } from "./lexicon";
import { loadCaptureManifest, lookupCapture } from "./captureLookup";
import {
  useCaptureQueue,
  useGlossStore,
  useSignQueue,
  useTranscriptionStore,
  type CaptureQueueItem,
  type GlossToken,
} from "./stores/pipeline";

/**
 * Single source of truth for the "transcript → gloss → queue" pipeline.
 *
 * Subscribes to useTranscriptionStore.transcript, runs the LLM → rules
 * fallback, annotates OOV flags via the lexicon, buckets tokens into the
 * capture queue (real mocap) or sign queue (pose-preset fallback), and
 * sets the engine badge.
 *
 * Called from both MicControl (full UI) and the /embed page (extension
 * iframe — no MicControl rendered).
 */
export function useTranscriptPipeline(): void {
  const transcript = useTranscriptionStore((s) => s.transcript);
  const setGenerating = useTranscriptionStore((s) => s.setGenerating);
  const setEngine = useTranscriptionStore((s) => s.setEngine);
  const setTokens = useGlossStore((s) => s.setTokens);
  const enqueueSigns = useSignQueue((s) => s.enqueue);
  const enqueueCapture = useCaptureQueue((s) => s.enqueue);

  useEffect(() => {
    if (!transcript) return;
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      setGenerating(true);

      let tokens: GlossToken[] | null = await glossifyViaLlm(
        transcript,
        controller.signal,
      );
      if (!tokens) tokens = glossify(transcript);

      try {
        const lexicon = await loadLexicon();
        tokens = tokens.map((token) => ({
          ...token,
          isOOV: resolveSign(token, lexicon).isOOV,
        }));
      } catch {
        // leave tokens unannotated if lexicon is unavailable
      }
      if (cancelled) {
        setGenerating(false);
        return;
      }
      setTokens(tokens);

      const manifest = await loadCaptureManifest();
      if (cancelled) {
        setGenerating(false);
        return;
      }

      const captureItems: CaptureQueueItem[] = [];
      let anyCapture = false;
      for (const token of tokens) {
        const url = lookupCapture(token.text, manifest);
        if (url) anyCapture = true;
        captureItems.push({
          gloss: token.text,
          captureUrl: url,
          nmm: token.nmm,
          durationMs: url ? 1400 : 1100,
        });
      }

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
      controller.abort();
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
}
