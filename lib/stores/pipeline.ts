import { create } from "zustand";
import type { SignComposition } from "../signCompose";

export type NMM = "wh" | "neg" | "yn";
export type Engine = "mocap" | "composition" | "rules" | "idle";

export type GlossToken = {
  text: string;
  nmm?: NMM;
  isOOV?: boolean;
};

type TranscriptionState = {
  transcript: string;
  isRecording: boolean;
  isGenerating: boolean;
  engine: Engine;
  error: string | null;
  setTranscript: (text: string) => void;
  setRecording: (on: boolean) => void;
  setGenerating: (on: boolean) => void;
  setEngine: (engine: Engine) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
};

export const useTranscriptionStore = create<TranscriptionState>((set) => ({
  transcript: "",
  isRecording: false,
  isGenerating: false,
  engine: "idle",
  error: null,
  setTranscript: (text) => set({ transcript: text, error: null }),
  setRecording: (on) => set({ isRecording: on }),
  setGenerating: (on) => set({ isGenerating: on }),
  setEngine: (engine) => set({ engine }),
  setError: (msg) => set({ error: msg }),
  reset: () =>
    set({
      transcript: "",
      isRecording: false,
      isGenerating: false,
      engine: "idle",
      error: null,
    }),
}));

type GlossState = {
  tokens: GlossToken[];
  setTokens: (tokens: GlossToken[]) => void;
  clear: () => void;
};

export const useGlossStore = create<GlossState>((set) => ({
  tokens: [],
  setTokens: (tokens) => set({ tokens }),
  clear: () => set({ tokens: [] }),
}));

type SignQueueState = {
  queue: GlossToken[];
  current: GlossToken | null;
  enqueue: (tokens: GlossToken[]) => void;
  advance: () => void;
  reset: () => void;
};

export const useSignQueue = create<SignQueueState>((set, get) => ({
  queue: [],
  current: null,
  enqueue: (tokens) => {
    const state = get();
    const q = state.queue;
    if (!state.current && tokens.length > 0) {
      set({ current: tokens[0], queue: [...q, ...tokens.slice(1)] });
    } else {
      set({ queue: [...q, ...tokens] });
    }
  },
  advance: () => {
    const [next, ...rest] = get().queue;
    set({ current: next ?? null, queue: rest });
  },
  reset: () => set({ queue: [], current: null }),
}));

// ---------- Mocap capture queue (Phase 13+, v2.0) ----------
// Carries references to pre-captured ISL sign JSON clips. AvatarStage prefers
// this queue over the rules queue when present. Each item knows its gloss,
// capture URL (may be null if not yet captured), and an optional nmm flag
// from the glossify engine.

export type CaptureQueueItem = {
  gloss: string;
  /** Authoritative mocap clip URL (preferred if present). */
  captureUrl: string | null;
  /** Procedural composition (used when no captureUrl — before pose-preset fallback). */
  composition?: SignComposition;
  nmm?: NMM;
  /** Queue-pacing duration in ms; overridden by clip.durationMs when captureUrl resolves. */
  durationMs: number;
};

type CaptureQueueState = {
  queue: CaptureQueueItem[];
  current: CaptureQueueItem | null;
  startedAt: number | null; // performance.now() when current began
  enqueue: (items: CaptureQueueItem[]) => void;
  advance: () => void;
  reset: () => void;
};

export const useCaptureQueue = create<CaptureQueueState>((set, get) => ({
  queue: [],
  current: null,
  startedAt: null,
  enqueue: (items) => {
    const state = get();
    const q = state.queue;
    if (!state.current && items.length > 0) {
      set({
        current: items[0],
        queue: [...q, ...items.slice(1)],
        startedAt: performance.now(),
      });
    } else {
      set({ queue: [...q, ...items] });
    }
  },
  advance: () => {
    const [next, ...rest] = get().queue;
    set({
      current: next ?? null,
      queue: rest,
      startedAt: next ? performance.now() : null,
    });
  },
  reset: () => set({ queue: [], current: null, startedAt: null }),
}));
