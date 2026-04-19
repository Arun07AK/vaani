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

/** Max signs allowed in the capture queue — keeps the avatar within ~4-6 s of
 *  real audio instead of accumulating a 15-30 s backlog during continuous
 *  speech. `current` is never dropped; oldest queued items go first. */
const MAX_QUEUE_DEPTH = 8;

const SMALL_NUMBERS: Record<string, string> = {
  "0": "ZERO",
  "1": "ONE",
  "2": "TWO",
  "3": "THREE",
  "4": "FOUR",
  "5": "FIVE",
  "6": "SIX",
  "7": "SEVEN",
  "8": "EIGHT",
  "9": "NINE",
  "10": "TEN",
};

/** Expand a numeric gloss ("42") to word-form digit glosses (["FOUR","TWO"]).
 *  Returns null when the token isn't purely numeric — caller continues the
 *  tier cascade. NMM rides on the LAST sub-token so the brow-raise stays on
 *  the right place. */
function expandNumericGloss(
  text: string,
  nmm: GlossToken["nmm"],
): GlossToken[] | null {
  if (!/^\d+$/.test(text)) return null;
  if (text in SMALL_NUMBERS) return [{ text: SMALL_NUMBERS[text], nmm }];
  const digits = text.split("");
  return digits.map((d, i) => ({
    text: SMALL_NUMBERS[d] ?? d,
    nmm: i === digits.length - 1 ? nmm : undefined,
  }));
}

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
    // #region agent log
    const _runStartedAt = Date.now();
    try {
      fetch('http://127.0.0.1:7391/ingest/0ca204d3-54b2-4929-9009-05fc8cd40158', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '3103cc' },
        body: JSON.stringify({
          sessionId: '3103cc',
          location: 'useTranscriptPipeline.ts:effect',
          message: 'pipeline RUN start',
          data: { transcript: transcript.slice(0, 120), len: transcript.length },
          timestamp: _runStartedAt,
        }),
      }).catch(() => {});
    } catch {}
    // #endregion

    const run = async () => {
      setGenerating(true);

      // Strip the zero-width-space sentinel that the embed page appends to
      // force-trigger this effect on duplicate transcripts.
      const cleanTranscript = transcript.replace(/\u200b+/g, "").trim();
      if (!cleanTranscript) {
        setGenerating(false);
        return;
      }

      // 1. English/Hindi → ISL gloss (LLM primary, rules fallback).
      let tokens: GlossToken[] | null = await glossifyViaLlm(
        cleanTranscript,
        controller.signal,
      );
      if (!tokens) tokens = glossify(cleanTranscript);

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

      // Pending NMM from a dropped tier-4 item — gets attached to the next
      // resolvable item so the brow-raise/head-shake doesn't silently vanish
      // when an LLM-emitted numeric / punctuated gloss gets skipped.
      let pendingNmm: GlossToken["nmm"] = undefined;
      const takeNmm = (tokenNmm: GlossToken["nmm"]): GlossToken["nmm"] => {
        const inherited = pendingNmm;
        pendingNmm = undefined;
        return tokenNmm ?? inherited;
      };

      // Normalize token stream: expand numerics into digit-word sequences so
      // they hit tier 2 (ONE…TEN are in signDecomposition.ts) instead of
      // falling off the end as "2" → silent tier-4.
      const normalizedTokens: GlossToken[] = [];
      for (const token of tokens) {
        const numeric = expandNumericGloss(token.text, token.nmm);
        if (numeric) {
          normalizedTokens.push(...numeric);
        } else {
          normalizedTokens.push(token);
        }
      }

      const COMPOUND_SEP_RE = /[-_\s]+/;

      for (const token of normalizedTokens) {
        const captureUrl = lookupCapture(token.text, manifest);
        if (captureUrl) {
          // Tier 1 — captured mocap (real signer).
          flatItems.push({
            gloss: token.text,
            captureUrl,
            nmm: takeNmm(token.nmm),
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
            nmm: takeNmm(token.nmm),
            durationMs: decomp.durationMs,
          });
          anyComposition = true;
          continue;
        }

        // Tier 2b — compound gloss (e.g. "GOOD-MORNING"): split and re-resolve
        // each sub-part through captures+decomp. NMM rides on the last sub-part.
        if (COMPOUND_SEP_RE.test(token.text)) {
          const parts = token.text.split(COMPOUND_SEP_RE).filter(Boolean);
          if (parts.length >= 2) {
            const subItems: CaptureQueueItem[] = [];
            let subMocap = false;
            let subComposition = false;
            let allResolved = true;
            for (const part of parts) {
              const partCapture = lookupCapture(part, manifest);
              if (partCapture) {
                subItems.push({
                  gloss: part,
                  captureUrl: partCapture,
                  nmm: undefined,
                  durationMs: 1400,
                });
                subMocap = true;
                continue;
              }
              const partDecomp = decompositionFor(part);
              if (partDecomp) {
                subItems.push({
                  gloss: part,
                  captureUrl: null,
                  composition: partDecomp,
                  nmm: undefined,
                  durationMs: partDecomp.durationMs,
                });
                subComposition = true;
                continue;
              }
              allResolved = false;
              break;
            }
            if (allResolved && subItems.length >= 2) {
              const finalNmm = takeNmm(token.nmm);
              if (finalNmm) subItems[subItems.length - 1].nmm = finalNmm;
              flatItems.push(...subItems);
              if (subMocap) anyMocap = true;
              if (subComposition) anyComposition = true;
              continue;
            }
          }
        }

        // Tier 3 — fingerspell (strips separators internally).
        if (canFingerspell(token.text)) {
          const letters = fingerspellWord(token.text);
          if (letters.length > 0) {
            const clean = token.text.toUpperCase().replace(/[^A-Z]/g, "");
            const finalNmm = takeNmm(token.nmm);
            for (let i = 0; i < letters.length; i++) {
              flatItems.push({
                gloss: `${clean}[${clean[i] ?? "?"}]`,
                captureUrl: null,
                composition: letters[i],
                nmm: i === letters.length - 1 ? finalNmm : undefined,
                durationMs: letters[i].durationMs,
              });
            }
            anyFingerspell = true;
            continue;
          }
        }

        // Tier 4 — previously enqueued a silent pose-preset placeholder that
        // made the avatar stand idle for 1.1 s per unresolvable token. We drop
        // the item here so the queue only contains items that visibly animate.
        // Any NMM attached to this token is carried onto the NEXT resolvable
        // token via `pendingNmm` so brow-raise / head-shake isn't lost.
        if (token.nmm && !pendingNmm) pendingNmm = token.nmm;
      }

      // Anti-repetition pass.
      const deduped = applyAntiRepetition(flatItems);

      // Cap queue depth. During continuous speech the pipeline fires every ~3 s
      // while each sign takes ~1-1.4 s to play — without trimming the queue
      // balloons and the avatar falls 15-30 s behind audio. Trim existing
      // queue (preserving `current`, never killing what's mid-animation) so
      // the total after enqueue sits at MAX_QUEUE_DEPTH.
      const queueState = useCaptureQueue.getState();
      const currentCount = queueState.current ? 1 : 0;
      const existingQueue = queueState.queue;
      const budget = Math.max(0, MAX_QUEUE_DEPTH - currentCount - deduped.length);
      if (existingQueue.length > budget) {
        const dropCount = existingQueue.length - budget;
        const trimmed = existingQueue.slice(dropCount);
        useCaptureQueue.setState({ queue: trimmed });
      }

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
      // #region agent log
      try {
        fetch('http://127.0.0.1:7391/ingest/0ca204d3-54b2-4929-9009-05fc8cd40158', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '3103cc' },
          body: JSON.stringify({
            sessionId: '3103cc',
            location: 'useTranscriptPipeline.ts:cleanup',
            message: 'pipeline ABORTED (new transcript or unmount)',
            data: { aborted_transcript: transcript.slice(0, 80), elapsedMs: Date.now() - _runStartedAt },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      } catch {}
      // #endregion
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
