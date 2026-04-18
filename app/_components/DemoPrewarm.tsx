"use client";

import { useEffect } from "react";
import { parseAnimationSpec, type AnimationSpec } from "@/lib/animationSpec";

const DEMO_SPINE = [
  "hello",
  "thank you my friend",
  "what is your name",
  "i want water",
  "astronaut sees earth",
  "yesterday i go school",
];

const LOCAL_CACHE_KEY = "vaani.llm.cache.v1";

function getCache(): Record<string, AnimationSpec> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AnimationSpec>) : {};
  } catch {
    return {};
  }
}

function setCache(cache: Record<string, AnimationSpec>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

async function prewarmOne(text: string): Promise<AnimationSpec | null> {
  try {
    const res = await fetch("/api/sign-from-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { spec?: unknown };
    return parseAnimationSpec(data.spec);
  } catch {
    return null;
  }
}

/**
 * Prewarms the demo-spine sentences into localStorage on page mount, so a
 * judge's first utterance is served instantly from cache. Fires one sentence
 * at a time (2s delay between) to stay under OpenAI rate limits and to avoid
 * saturating the Vercel cold-start tier.
 */
export default function DemoPrewarm() {
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // Small initial delay so it doesn't compete with the user's first interaction.
      await new Promise((r) => setTimeout(r, 1500));
      const cache = getCache();
      for (const text of DEMO_SPINE) {
        if (cancelled) return;
        const key = text.trim().toLowerCase();
        if (cache[key]) continue;
        const spec = await prewarmOne(text);
        if (spec) {
          cache[key] = spec;
          setCache(cache);
        }
        // Spread the calls — gpt-4o-mini completes in ~10-20s each.
        await new Promise((r) => setTimeout(r, 2000));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
