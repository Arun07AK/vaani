import { create } from "zustand";
import type { SignAnim } from "../animationSpec";

export type NMM = "wh" | "neg" | "yn";
export type Engine = "llm" | "rules" | "idle";

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

// ---------- LLM sign queue (Phase 8+) ----------
// Carries SignAnim items (LLM-generated keyframe bundles). When the LLM path
// is active, the AvatarStage prefers this queue over the rules queue.

type LlmQueueState = {
  queue: SignAnim[];
  current: SignAnim | null;
  startedAt: number | null; // performance.now() when current began
  enqueue: (signs: SignAnim[]) => void;
  advance: () => void;
  reset: () => void;
};

export const useLlmQueue = create<LlmQueueState>((set, get) => ({
  queue: [],
  current: null,
  startedAt: null,
  enqueue: (signs) => {
    const state = get();
    const q = state.queue;
    if (!state.current && signs.length > 0) {
      set({
        current: signs[0],
        queue: [...q, ...signs.slice(1)],
        startedAt: performance.now(),
      });
    } else {
      set({ queue: [...q, ...signs] });
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
