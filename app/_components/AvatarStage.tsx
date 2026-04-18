"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Group } from "three";

const AVATAR_URL = "/avatars/vaani.glb";

function PlaceholderAvatar() {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.4;
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 1.5, 0]}>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshStandardMaterial color="#7c3aed" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <capsuleGeometry args={[0.3, 1.4, 4, 16]} />
        <meshStandardMaterial color="#4338ca" roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1.2, 32]} />
        <meshStandardMaterial color="#1e1b4b" roughness={0.9} />
      </mesh>
    </group>
  );
}

function RPMAvatar({ onReady }: { onReady: (names: string[]) => void }) {
  const { scene, animations } = useGLTF(AVATAR_URL);
  const { actions, names } = useAnimations(animations, scene);

  useEffect(() => {
    onReady(names);
    const first = names[0];
    if (first && actions[first]) actions[first]!.reset().fadeIn(0.3).play();
    return () => {
      Object.values(actions).forEach((a) => a?.fadeOut(0.2));
    };
  }, [actions, names, onReady]);

  return <primitive object={scene} scale={1} position={[0, -1.2, 0]} />;
}

function AvatarContent({ avatarLoaded, onNames }: { avatarLoaded: boolean; onNames: (names: string[]) => void }) {
  return avatarLoaded ? <RPMAvatar onReady={onNames} /> : <PlaceholderAvatar />;
}

export default function AvatarStage() {
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [clipNames, setClipNames] = useState<string[]>([]);
  const [selectedClip, setSelectedClip] = useState<string>("");
  const [crossfadeMs, setCrossfadeMs] = useState(250);

  useEffect(() => {
    fetch(AVATAR_URL, { method: "HEAD" })
      .then((r) => setAvatarLoaded(r.ok))
      .catch(() => setAvatarLoaded(false));
  }, []);

  const debugVisible = useMemo(() => process.env.NODE_ENV !== "production", []);

  return (
    <div className="relative h-[70vh] w-full max-w-4xl">
      <Canvas
        className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-[#0b0b1f] to-black"
        camera={{ position: [0, 1.2, 3.2], fov: 35, near: 0.1, far: 50 }}
        dpr={[1, 2]}
        shadows={false}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 4, 3]} intensity={1.2} />
        <Suspense fallback={null}>
          <AvatarContent avatarLoaded={avatarLoaded} onNames={setClipNames} />
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
          <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            debug
          </div>
          <div>
            status: {avatarLoaded ? "GLB loaded" : "placeholder — drop vaani.glb into public/avatars/"}
          </div>
          {clipNames.length > 0 && (
            <label className="flex items-center gap-2">
              <span>clip:</span>
              <select
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                value={selectedClip}
                onChange={(e) => setSelectedClip(e.target.value)}
              >
                <option value="">—</option>
                {clipNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
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
