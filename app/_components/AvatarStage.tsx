"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Group, AnimationAction } from "three";
import { useSignQueue } from "@/lib/stores/pipeline";
import { loadLexicon, resolveSign, type SignEntry } from "@/lib/lexicon";
import type { GlossToken } from "@/lib/stores/pipeline";

const AVATAR_URL = "/avatars/vaani.glb";

type CurrentSign = {
  token: GlossToken;
  entry: SignEntry;
} | null;

function PlaceholderAvatar({ active, nmm }: { active: boolean; nmm?: GlossToken["nmm"] }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * (active ? 1.5 : 0.3);
  });
  const headColor = active ? "#f472b6" : "#7c3aed";
  const bodyColor = nmm === "wh" ? "#fbbf24" : nmm === "neg" ? "#ef4444" : "#4338ca";
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

function RPMAvatar({
  onReady,
  currentSign,
  crossfadeSec,
}: {
  onReady: (names: string[]) => void;
  currentSign: CurrentSign;
  crossfadeSec: number;
}) {
  const { scene, animations } = useGLTF(AVATAR_URL);
  const { actions, names, mixer } = useAnimations(animations, scene);
  const prevActionRef = useRef<AnimationAction | null>(null);

  useEffect(() => {
    onReady(names);
  }, [names, onReady]);

  useEffect(() => {
    if (!currentSign) return;
    const clipName = currentSign.entry.source;
    const next = actions[clipName];
    if (!next) return;
    const prev = prevActionRef.current;
    next.reset().fadeIn(crossfadeSec).play();
    if (prev && prev !== next) prev.fadeOut(crossfadeSec);
    prevActionRef.current = next;
    return () => {
      // let the mixer keep the tail; nothing to do here
      void mixer;
    };
  }, [currentSign, actions, crossfadeSec, mixer]);

  return <primitive object={scene} scale={1} position={[0, -1.2, 0]} />;
}

function AvatarContent({
  avatarLoaded,
  onNames,
  currentSign,
  crossfadeSec,
}: {
  avatarLoaded: boolean;
  onNames: (names: string[]) => void;
  currentSign: CurrentSign;
  crossfadeSec: number;
}) {
  return avatarLoaded ? (
    <RPMAvatar onReady={onNames} currentSign={currentSign} crossfadeSec={crossfadeSec} />
  ) : (
    <PlaceholderAvatar active={!!currentSign} nmm={currentSign?.token.nmm} />
  );
}

export default function AvatarStage() {
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [clipNames, setClipNames] = useState<string[]>([]);
  const [crossfadeMs, setCrossfadeMs] = useState(250);
  const [lexicon, setLexicon] = useState<Map<string, SignEntry> | null>(null);
  const [currentSign, setCurrentSign] = useState<CurrentSign>(null);
  const current = useSignQueue((s) => s.current);
  const advance = useSignQueue((s) => s.advance);

  useEffect(() => {
    fetch(AVATAR_URL, { method: "HEAD" })
      .then((r) => setAvatarLoaded(r.ok))
      .catch(() => setAvatarLoaded(false));
  }, []);

  useEffect(() => {
    loadLexicon()
      .then(setLexicon)
      .catch((err) => console.error("[lexicon]", err));
  }, []);

  useEffect(() => {
    if (!current) {
      setCurrentSign(null);
      return;
    }
    if (!lexicon) return;
    const { entry } = resolveSign(current, lexicon);
    setCurrentSign({ token: current, entry });
    const t = setTimeout(() => advance(), entry.durationMs);
    return () => clearTimeout(t);
  }, [current, lexicon, advance]);

  const debugVisible = useMemo(() => process.env.NODE_ENV !== "production", []);

  return (
    <div className="relative h-[58vh] w-full max-w-4xl">
      <Canvas
        className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-[#0b0b1f] to-black"
        camera={{ position: [0, 1.2, 3.2], fov: 35, near: 0.1, far: 50 }}
        dpr={[1, 2]}
        shadows={false}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 4, 3]} intensity={1.2} />
        <Suspense fallback={null}>
          <AvatarContent
            avatarLoaded={avatarLoaded}
            onNames={setClipNames}
            currentSign={currentSign}
            crossfadeSec={crossfadeMs / 1000}
          />
          <Environment preset="city" />
        </Suspense>
        <OrbitControls
          enableZoom
          enablePan={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 2}
          target={[0, 0.9, 0]}
        />
      </Canvas>

      {debugVisible && (
        <div className="absolute bottom-3 right-3 flex flex-col gap-2 rounded-lg border border-zinc-800 bg-black/80 p-3 text-xs text-zinc-300 backdrop-blur">
          <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">debug</div>
          <div>
            avatar: {avatarLoaded ? "GLB loaded" : "placeholder (drop vaani.glb into public/avatars/)"}
          </div>
          <div>
            lexicon: {lexicon ? `${lexicon.size} entries` : "loading…"}
          </div>
          <div>
            now playing: {currentSign?.token.text ?? "—"}
            {currentSign?.token.nmm ? ` · ${currentSign.token.nmm}` : ""}
          </div>
          {clipNames.length > 0 && (
            <div>
              clips in GLB: {clipNames.slice(0, 5).join(", ")}
              {clipNames.length > 5 ? "…" : ""}
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
        </div>
      )}
    </div>
  );
}

useGLTF.preload(AVATAR_URL);
