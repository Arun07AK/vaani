"use client";

import { useGlossStore, useSignQueue } from "@/lib/stores/pipeline";

export default function GlossOverlay() {
  const tokens = useGlossStore((s) => s.tokens);
  const current = useSignQueue((s) => s.current);
  const queue = useSignQueue((s) => s.queue);

  if (tokens.length === 0 && !current) return null;

  return (
    <section className="flex w-full max-w-2xl flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {tokens.map((t, i) => {
          const isActive = current && current.text === t.text && i === 0;
          return (
            <span
              key={`${t.text}-${i}`}
              className={[
                "rounded-full border px-3 py-1 text-xs font-mono uppercase tracking-wider transition",
                isActive
                  ? "border-violet-400 bg-violet-500/20 text-violet-100"
                  : "border-zinc-800 bg-zinc-900/50 text-zinc-400",
                t.isOOV ? "animate-pulse border-amber-500 text-amber-300" : "",
              ].join(" ")}
            >
              {t.text}
              {t.nmm && (
                <sup className="ml-1 text-[8px] text-violet-300">{t.nmm}</sup>
              )}
            </span>
          );
        })}
      </div>
      {current && queue.length > 0 && (
        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">
          next: {queue.map((q) => q.text).join(" · ")}
        </div>
      )}
    </section>
  );
}
