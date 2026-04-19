"use client";

import { useEffect } from "react";
import { glossify } from "./glossify";
import { glossifyViaLlm } from "./glossifyLlm";
import { loadLexicon, resolveSign } from "./lexicon";
import { loadCaptureManifest, lookupCapture } from "./captureLookup";
import { decompositionFor } from "./signDecomposition";
import { canFingerspell, fingerspellWord } from "./fingerspelling";
import { compositionFingerprint } from "./signCompose";
import {
  useCaptureQueue,
  useGlossStore,
  useSignQueue,
  useTranscriptionStore,
  type CaptureQueueItem,
  type Engine,
  type GlossToken,
} from "./stores/pipeline";

/**
 * Transcript → gloss → sign queue pipeline.
 *
 * Resolution cascade per gloss:
 *   1. captured mocap JSON (ISLRTC real signer, 14 signs) — highest fidelity
 *   2. decomposition dictionary (phonological primitives, ~50 signs) — distinct motions
 *   3. fingerspelling (A–Z one-handed) — letter-by-letter for unknown words
 *   4. pose-preset fallback (signQueue path) — last resort for anything else
 *
 * Anti-repetition: if two adjacent signs resolve to an identical composition
 * fingerprint (same handshape+palm+location+movement), nudge the second one's
 * movement to break visual adjacency.
 */

const SIMILARITY_NUDGES = ["TAP_ONCE", "ARC_FORWARD", "ARC_UP", "SIDE_TO_SIDE"] as const;

function applyAntiRepetition(items: CaptureQueueItem[]): CaptureQueueItem[] {
  const out: CaptureQueueItem[] = [];
  let lastFp: string | null = null;
  let nudgeIdx = 0;
  for (const item of items) {
    if (!item.composition) {
      out.push(item);
      lastFp = null; // mocap breaks adjacency naturally
      continue;
    }
    const fp = compositionFingerprint(item.composition);
    if (lastFp && fp === lastFp) {
      // Replace movement with a nudge to break visual collapse.
      const nudge = SIMILARITY_NUDGES[nudgeIdx % SIMILARITY_NUDGES.length];
      nudgeIdx++;
      out.push({
        ...item,
        composition: { ...item.composition, movement: nudge },
      });
    } else {
      out.push(item);
    }
    lastFp = fp;
  }
  return out;
}

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

      // 1. English/Hindi → ISL gloss (LLM primary, rules fallback).
      let tokens: GlossToken[] | null = await glossifyViaLlm(
        transcript,
        controller.signal,
      );
      if (!tokens) tokens = glossify(transcript);

      // 2. OOV flags for UI.
      try {
        const lexicon = await loadLexicon();
        tokens = tokens.map((token) => ({
          ...token,
          isOOV: resolveSign(token, lexicon).isOOV,
        }));
      } catch {}
      if (cancelled) {
        setGenerating(false);
        return;
      }
      setTokens(tokens);

      // 3. Resolve each gloss through the 4-tier cascade.
      const manifest = await loadCaptureManifest();
      if (cancelled) {
        setGenerating(false);
        return;
      }

      const flatItems: CaptureQueueItem[] = [];
      let anyMocap = false;
      let anyComposition = false;
      let anyFingerspell = false;

      for (const token of tokens) {
        const captureUrl = lookupCapture(token.text, manifest);
        if (captureUrl) {
          // Tier 1 — captured mocap (real signer).
          flatItems.push({
            gloss: token.text,
            captureUrl,
            nmm: token.nmm,
            durationMs: 1400,
          });
          anyMocap = true;
          continue;
        }

        const decomp = decompositionFor(token.text);
        if (decomp) {
          // Tier 2 — procedural composition.
          flatItems.push({
            gloss: token.text,
            captureUrl: null,
            composition: decomp,
            nmm: token.nmm,
            durationMs: decomp.durationMs,
          });
          anyComposition = true;
          continue;
        }

        // Tier 3 — fingerspell.
        if (canFingerspell(token.text)) {
          const letters = fingerspellWord(token.text);
          for (let i = 0; i < letters.length; i++) {
            flatItems.push({
              gloss: `${token.text}[${token.text[i]?.toUpperCase() ?? "?"}]`,
              captureUrl: null,
              composition: letters[i],
              nmm: i === letters.length - 1 ? token.nmm : undefined,
              durationMs: letters[i].durationMs,
            });
          }
          anyFingerspell = true;
          continue;
        }

        // Tier 4 — pose-preset fallback (legacy path).
        flatItems.push({
          gloss: token.text,
          captureUrl: null,
          nmm: token.nmm,
          durationMs: 1100,
        });
      }

      // Anti-repetition pass.
      const deduped = applyAntiRepetition(flatItems);

      // Always use the capture queue now — it handles mocap, composition,
      // fingerspelling, AND pose-preset fallback all through a single path.
      enqueueCapture(deduped);

      const engine: Engine = anyMocap
        ? "mocap"
        : anyComposition || anyFingerspell
          ? "composition"
          : "rules";
      setEngine(engine);
      setGenerating(false);

      // Clear the legacy signQueue so it doesn't double-render.
      useSignQueue.getState().reset();
      void enqueueSigns;
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
