"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Environment,
  OrbitControls,
  Stars,
  useAnimations,
  useGLTF,
} from "@react-three/drei";
import { Group, AnimationAction, LoopOnce } from "three";
import { useCaptureQueue, useSignQueue } from "@/lib/stores/pipeline";
import { loadLexicon, resolveSign, type SignEntry } from "@/lib/lexicon";
import type { GlossToken } from "@/lib/stores/pipeline";
import { loadClip, type CaptureClip } from "@/lib/capturePlayer";
import VRMAvatar from "./VRMAvatar";

const AVATAR_URL = "/avatars/vaani.glb";
const VRM_URL = "/avatars/vaani.vrm";
const LOOPING_CLIPS = new Set(["Idle", "Walking", "Running", "Dance"]);
const DEFAULT_CAPTURE_DURATION_MS = 1400;

type CurrentSign = {
  token: GlossToken;
  entry: SignEntry;
} | null;

function PlaceholderAvatar({
  active,
  nmm,
}: {
  active: boolean;
  nmm?: GlossToken["nmm"];
}) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * (active ? 1.5 : 0.3);
  });
  const headColor = active ? "#f472b6" : "#7c3aed";
  const bodyColor =
    nmm === "wh" ? "#fbbf24" : nmm === "neg" ? "#ef4444" : "#4338ca";
  return (
    <group ref={ref}>
      <mesh position={[0, 1.5, 0]}>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshStandardMaterial color={headColor} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <capsuleGeometry args={[0.3, 1.4, 4, 16]} />
        <meshStandardMaterial color={bodyColor} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1.2, 32]} />
        <meshStandardMaterial color="#1e1b4b" roughness={0.9} />
      </mesh>
    </group>
  );
}

function RobotAvatar({
  onReady,
  currentSign,
  crossfadeSec,
}: {
  onReady: (names: string[]) => void;
  currentSign: CurrentSign;
  crossfadeSec: number;
}) {
  const { scene, animations } = useGLTF(AVATAR_URL);
  const { actions, names } = useAnimations(animations, scene);
  const prevActionRef = useRef<AnimationAction | null>(null);
  const idleActionRef = useRef<AnimationAction | null>(null);

  useEffect(() => {
    onReady(names);
    const idle = actions["Idle"];
    if (idle) {
      idleActionRef.current = idle;
      idle.reset().play();
      prevActionRef.current = idle;
    }
  }, [actions, names, onReady]);

  useEffect(() => {
    if (!currentSign) {
      const idle = idleActionRef.current;
      const prev = prevActionRef.current;
      if (idle && prev && prev !== idle) {
        prev.fadeOut(crossfadeSec);
        idle.reset().fadeIn(crossfadeSec).play();
        prevActionRef.current = idle;
      }
      return;
    }
    const clipName = currentSign.entry.source;
    const next = actions[clipName] ?? actions["Idle"];
    if (!next) return;

    const isLooping = LOOPING_CLIPS.has(clipName);
    if (!isLooping) {
      next.setLoop(LoopOnce, 1);
      next.clampWhenFinished = true;
    }
    next.timeScale = currentSign.token.nmm === "neg" ? 1.15 : 1.0;

    const prev = prevActionRef.current;
    next.reset().fadeIn(crossfadeSec).play();
    if (prev && prev !== next) prev.fadeOut(crossfadeSec);
    prevActionRef.current = next;
  }, [currentSign, actions, crossfadeSec]);

  return <primitive object={scene} scale={0.55} position={[0, -1.2, 0]} />;
}

function AvatarContent({
  mode,
  onNames,
  currentSign,
  captureClip,
  captureGloss,
  captureElapsedSec,
  captureNmm,
  crossfadeSec,
}: {
  mode: "vrm" | "glb" | "placeholder";
  onNames: (names: string[]) => void;
  currentSign: CurrentSign;
  captureClip: CaptureClip | null;
  captureGloss: string | null;
  captureElapsedSec: number;
  captureNmm?: "wh" | "neg" | "yn";
  crossfadeSec: number;
}) {
  if (mode === "vrm") {
    return (
      <VRMAvatar
        currentSign={currentSign}
        captureClip={captureClip}
        captureGloss={captureGloss}
        captureElapsedSec={captureElapsedSec}
        captureNmm={captureNmm}
      />
    );
  }
  if (mode === "glb") {
    return (
      <RobotAvatar
        onReady={onNames}
        currentSign={currentSign}
        crossfadeSec={crossfadeSec}
      />
    );
  }
  return (
    <PlaceholderAvatar
      active={!!currentSign || !!captureClip}
      nmm={captureNmm ?? currentSign?.token.nmm}
    />
  );
}

export default function AvatarStage() {
  const [mode, setMode] = useState<"vrm" | "glb" | "placeholder">("placeholder");
  const [clipNames, setClipNames] = useState<string[]>([]);
  const [crossfadeMs, setCrossfadeMs] = useState(250);
  const [lexicon, setLexicon] = useState<Map<string, SignEntry> | null>(null);
  const [currentSign, setCurrentSign] = useState<CurrentSign>(null);
  const [captureClip, setCaptureClip] = useState<CaptureClip | null>(null);
  const [captureElapsedSec, setCaptureElapsedSec] = useState(0);

  const current = useSignQueue((s) => s.current);
  const advance = useSignQueue((s) => s.advance);
  const resetQueue = useSignQueue((s) => s.reset);

  const captureCurrent = useCaptureQueue((s) => s.current);
  const captureStartedAt = useCaptureQueue((s) => s.startedAt);
  const captureAdvance = useCaptureQueue((s) => s.advance);
  const captureReset = useCaptureQueue((s) => s.reset);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const vrm = await fetch(VRM_URL, { method: "HEAD" });
        if (!cancelled && vrm.ok) return setMode("vrm");
      } catch {}
      try {
        const glb = await fetch(AVATAR_URL, { method: "HEAD" });
        if (!cancelled && glb.ok) return setMode("glb");
      } catch {}
      if (!cancelled) setMode("placeholder");
    };
    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadLexicon()
      .then(setLexicon)
      .catch((err) => console.error("[lexicon]", err));
  }, []);

  // Rules-fallback queue: only runs when no capture queue is active.
  useEffect(() => {
    if (captureCurrent) {
      setCurrentSign(null);
      return;
    }
    if (!current) {
      setCurrentSign(null);
      return;
    }
    if (!lexicon) return;
    const { entry } = resolveSign(current, lexicon);
    setCurrentSign({ token: current, entry });
    const t = setTimeout(() => advance(), entry.durationMs);
    return () => clearTimeout(t);
  }, [current, lexicon, advance, captureCurrent]);

  // Capture queue: load clip when current changes, drive elapsed clock, advance when done.
  useEffect(() => {
    if (!captureCurrent) {
      setCaptureClip(null);
      setCaptureElapsedSec(0);
      return;
    }
    let cancelled = false;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const play = async () => {
      const clip = captureCurrent.captureUrl
        ? await loadClip(captureCurrent.captureUrl)
        : null;
      if (cancelled) return;
      setCaptureClip(clip);
      const duration = clip?.durationMs ?? captureCurrent.durationMs ?? DEFAULT_CAPTURE_DURATION_MS;
      const startedAt = captureStartedAt ?? performance.now();
      const tick = () => {
        if (cancelled) return;
        setCaptureElapsedSec((performance.now() - startedAt) / 1000);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      timer = setTimeout(() => captureAdvance(), duration);
    };
    void play();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [captureCurrent, captureStartedAt, captureAdvance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase() ?? "";
        if (tag === "input" || tag === "textarea") return;
        resetQueue();
        captureReset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resetQueue, captureReset]);

  const debugVisible = useMemo(
    () => process.env.NODE_ENV !== "production",
    [],
  );

  return (
    <div className="relative h-[58vh] w-full max-w-4xl">
      <Canvas
        className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-[#0b0b1f] to-black shadow-[0_0_80px_-20px_rgba(124,58,237,0.4)]"
        camera={{ position: [0, 1.2, 3.2], fov: 35, near: 0.1, far: 80 }}
        dpr={[1, 2]}
        shadows={false}
      >
        <color attach="background" args={["#05050f"]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[2, 4, 3]} intensity={1.2} />
        <pointLight position={[-3, 2, 2]} intensity={0.6} color="#7c3aed" />
        <Stars radius={40} depth={35} count={2800} factor={3} saturation={0} fade speed={0.6} />
        <Suspense fallback={null}>
          <AvatarContent
            mode={mode}
            onNames={setClipNames}
            currentSign={currentSign}
            captureClip={captureClip}
            captureGloss={captureCurrent?.gloss ?? null}
            captureElapsedSec={captureElapsedSec}
            captureNmm={captureCurrent?.nmm}
            crossfadeSec={crossfadeMs / 1000}
          />
          <Environment preset="city" />
        </Suspense>
        <OrbitControls
          enableZoom
          enablePan={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 2}
          target={[0, 0.6, 0]}
        />
      </Canvas>

      {debugVisible && (
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5 rounded-lg border border-zinc-800 bg-black/70 p-3 text-xs text-zinc-300 backdrop-blur">
          <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            debug
          </div>
          <div>avatar: {mode}</div>
          <div>lexicon: {lexicon ? `${lexicon.size} entries` : "loading…"}</div>
          <div>
            now playing:{" "}
            {captureCurrent
              ? `${captureCurrent.gloss}${captureClip ? " (mocap)" : " (no clip → fallback)"}`
              : (currentSign?.token.text ?? "—")}
            {(captureCurrent?.nmm ?? currentSign?.token.nmm)
              ? ` · ${captureCurrent?.nmm ?? currentSign?.token.nmm}`
              : ""}
          </div>
          <div className="text-[10px] text-zinc-500">
            clip t: {captureCurrent ? captureElapsedSec.toFixed(2) : "—"}s
          </div>
          {clipNames.length > 0 && (
            <div className="text-[10px] text-zinc-500">
              clips: {clipNames.slice(0, 6).join(", ")}
              {clipNames.length > 6 ? "…" : ""}
            </div>
          )}
          <label className="flex items-center gap-2">
            <span>crossfade: {crossfadeMs}ms</span>
            <input
              type="range"
              min={0}
              max={1000}
              step={25}
              value={crossfadeMs}
              onChange={(e) => setCrossfadeMs(Number(e.target.value))}
              className="w-24 accent-violet-500"
            />
          </label>
          <div className="text-[10px] text-zinc-500">press R to reset queue</div>
        </div>
      )}
    </div>
  );
}

useGLTF.preload(AVATAR_URL);
