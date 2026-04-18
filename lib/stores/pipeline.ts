import { create } from "zustand";

export type NMM = "wh" | "neg" | "yn";

export type GlossToken = {
  text: string;
  nmm?: NMM;
  isOOV?: boolean;
};

type TranscriptionState = {
  transcript: string;
  isRecording: boolean;
  error: string | null;
  setTranscript: (text: string) => void;
  setRecording: (on: boolean) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
};

export const useTranscriptionStore = create<TranscriptionState>((set) => ({
  transcript: "",
  isRecording: false,
  error: null,
  setTranscript: (text) => set({ transcript: text, error: null }),
  setRecording: (on) => set({ isRecording: on }),
  setError: (msg) => set({ error: msg }),
  reset: () => set({ transcript: "", isRecording: false, error: null }),
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
