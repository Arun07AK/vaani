"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranscriptionStore } from "./stores/pipeline";
import { useMic } from "./useMic";

type SpeechRecognitionResult = {
  transcript: string;
  isFinal: boolean;
};

type SpeechRecognitionEvent = Event & {
  results: ArrayLike<ArrayLike<SpeechRecognitionResult>> & {
    length: number;
    [i: number]: ArrayLike<SpeechRecognitionResult> & {
      isFinal: boolean;
      length: number;
      [j: number]: SpeechRecognitionResult;
    };
  };
  resultIndex: number;
};

type SpeechRecognitionErrorEvent = Event & {
  error: string;
  message?: string;
};

type SpeechRecognitionInstance = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type UseASRResult = {
  isRecording: boolean;
  isBusy: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  supported: boolean;
  engine: "web-speech" | "whisper" | "none";
};

/**
 * Hybrid ASR hook: prefers browser-free Web Speech API (no network/key),
 * falls back to MediaRecorder + OpenAI Whisper when Web Speech isn't available.
 */
export function useSpeechASR(): UseASRResult {
  const setTranscript = useTranscriptionStore((s) => s.setTranscript);
  const setStoreRecording = useTranscriptionStore((s) => s.setRecording);
  const setStoreError = useTranscriptionStore((s) => s.setError);

  const [engine, setEngine] = useState<"web-speech" | "whisper" | "none">(
    "none",
  );
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalRef = useRef("");

  const whisper = useMic();

  const ctor = typeof window !== "undefined" ? getRecognitionCtor() : null;
  const hasWebSpeech = !!ctor;

  useEffect(() => {
    const nextEngine = hasWebSpeech
      ? "web-speech"
      : whisper.supported
        ? "whisper"
        : "none";
    setEngine((current) => (current === nextEngine ? current : nextEngine));
  }, [hasWebSpeech, whisper.supported]);

  const startWebSpeech = useCallback(async () => {
    if (!ctor) return;
    try {
      const rec = new ctor();
      rec.lang = "en-IN";
      rec.continuous = false;
      rec.interimResults = false;
      finalRef.current = "";

      rec.onresult = (e) => {
        let buf = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const alt = e.results[i][0];
          if (e.results[i].isFinal) buf += alt.transcript;
        }
        if (buf) finalRef.current += buf;
      };
      rec.onerror = (e) => {
        const msg = e.error || e.message || "speech recognition error";
        setError(msg);
        setStoreError(msg);
      };
      rec.onend = () => {
        setIsRecording(false);
        setStoreRecording(false);
        const text = finalRef.current.trim();
        if (text) setTranscript(text);
        recognitionRef.current = null;
      };
      rec.start();
      recognitionRef.current = rec;
      setIsRecording(true);
      setStoreRecording(true);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "speech recognition failed to start";
      setError(msg);
      setStoreError(msg);
    }
  }, [ctor, setStoreError, setStoreRecording, setTranscript]);

  const stopWebSpeech = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(async () => {
    if (engine === "web-speech") return startWebSpeech();
    if (engine === "whisper") return whisper.start();
    setError("no ASR engine available — use the type-input below");
  }, [engine, startWebSpeech, whisper]);

  const stop = useCallback(() => {
    if (engine === "web-speech") return stopWebSpeech();
    if (engine === "whisper") return whisper.stop();
  }, [engine, stopWebSpeech, whisper]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  return {
    isRecording: engine === "whisper" ? whisper.isRecording : isRecording,
    isBusy: engine === "whisper" ? whisper.isBusy : false,
    error: error || whisper.error,
    start,
    stop,
    supported: engine !== "none",
    engine,
  };
}
