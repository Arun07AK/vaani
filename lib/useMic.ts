"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranscriptionStore } from "./stores/pipeline";

const PREFERRED_MIME = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
];

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME.find((t) => MediaRecorder.isTypeSupported(t));
}

export type UseMicResult = {
  isRecording: boolean;
  isBusy: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  supported: boolean;
};

type LangGetter = () => string | undefined;

/**
 * `getLang` is an optional closure that returns the current ASR language
 * code (e.g. "en-IN", "hi-IN"). It's called at upload time so the correct
 * language is sent to Whisper regardless of when `start()` fired.
 */
export function useMic(getLang?: LangGetter): UseMicResult {
  const [isRecording, setIsRecording] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeRef = useRef<string | undefined>(undefined);
  const getLangRef = useRef<LangGetter | undefined>(getLang);
  getLangRef.current = getLang;

  const setTranscript = useTranscriptionStore((s) => s.setTranscript);
  const setStoreRecording = useTranscriptionStore((s) => s.setRecording);
  const setStoreError = useTranscriptionStore((s) => s.setError);

  const supported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const upload = useCallback(
    async (blob: Blob, mime: string) => {
      setIsBusy(true);
      setError(null);
      try {
        const ext = mime.includes("mp4") ? "m4a" : mime.includes("mpeg") ? "mp3" : "webm";
        const form = new FormData();
        form.append("audio", new File([blob], `rec.${ext}`, { type: mime }));
        // Map BCP-47 (en-IN, hi-IN) to Whisper's 2-letter code (en, hi).
        const langTag = getLangRef.current?.();
        if (langTag) {
          const short = langTag.split("-")[0];
          if (short) form.append("lang", short);
        }
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        const transcript = (data.transcript as string | undefined)?.trim() ?? "";
        setTranscript(transcript);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "transcription failed";
        setError(msg);
        setStoreError(msg);
      } finally {
        setIsBusy(false);
      }
    },
    [setTranscript, setStoreError],
  );

  const start = useCallback(async () => {
    if (!supported) {
      setError("microphone not supported in this browser");
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      mimeRef.current = mime;
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      });
      recorder.addEventListener("stop", () => {
        const type = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        cleanup();
        setIsRecording(false);
        setStoreRecording(false);
        if (blob.size > 0) {
          void upload(blob, type);
        }
      });
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setStoreRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "microphone permission denied";
      setError(msg);
      setStoreError(msg);
      cleanup();
    }
  }, [supported, cleanup, upload, setStoreRecording, setStoreError]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  return { isRecording, isBusy, error, start, stop, supported };
}
