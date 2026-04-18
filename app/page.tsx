export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#0a0a1f] via-[#0d0d2a] to-black px-6 text-center">
      <h1 className="bg-gradient-to-br from-white via-zinc-200 to-zinc-500 bg-clip-text text-5xl font-semibold tracking-tight text-transparent sm:text-7xl">
        VAANI
      </h1>
      <p className="max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
        Real-time spoken English to Indian Sign Language on a 3D avatar.
        <br />
        Hack Helix 2026 — Track 4, Problem 01.
      </p>
      <span className="rounded-full border border-zinc-800 bg-zinc-900/50 px-4 py-1 text-xs text-zinc-500">
        phase 0 scaffold — avatar loading in phase 1
      </span>
    </main>
  );
}
