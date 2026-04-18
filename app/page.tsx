import AvatarStage from "./_components/AvatarStage";
import GlossOverlay from "./_components/GlossOverlay";
import MicControl from "./_components/MicControl";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-start gap-6 bg-gradient-to-b from-[#0a0a1f] via-[#0d0d2a] to-black px-6 py-10 text-center">
      <header className="flex flex-col items-center gap-2">
        <h1 className="bg-gradient-to-br from-white via-zinc-200 to-zinc-500 bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-6xl">
          VAANI
        </h1>
        <p className="max-w-xl text-sm leading-6 text-zinc-400">
          Real-time spoken English to Indian Sign Language on a 3D avatar.
        </p>
      </header>

      <AvatarStage />
      <GlossOverlay />
      <MicControl />

      <footer className="mt-auto text-[11px] uppercase tracking-[0.2em] text-zinc-600">
        Hack Helix 2026 · Track 4 · Problem 01
      </footer>
    </main>
  );
}
