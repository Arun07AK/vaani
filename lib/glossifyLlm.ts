"use client";

import { z } from "zod";
import type { GlossToken, NMM } from "./stores/pipeline";

const llmResponseSchema = z
  .object({
    glossed: z.array(z.string()),
    nmms: z.array(z.enum(["wh", "neg", "yn"]).nullable()),
  })
  .transform((d) => {
    const tokens: GlossToken[] = d.glossed.map((text, i) => {
      const nmm = d.nmms[i] ?? undefined;
      const t: GlossToken = { text: text.toUpperCase() };
      if (nmm) t.nmm = nmm as NMM;
      return t;
    });
    return tokens;
  });

const LOCAL_CACHE_KEY = "vaani.llm.gloss.v1";
const LOCAL_CACHE_MAX = 50;

type LocalCache = Record<string, GlossToken[]>;

function loadLocalCache(): LocalCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? (JSON.parse(raw) as LocalCache) : {};
  } catch {
    return {};
  }
}

function saveLocalCache(next: LocalCache) {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(next);
    const bounded = entries.slice(-LOCAL_CACHE_MAX);
    window.localStorage.setItem(
      LOCAL_CACHE_KEY,
      JSON.stringify(Object.fromEntries(bounded)),
    );
  } catch {
    // quota / privacy mode
  }
}

export async function glossifyViaLlm(
  text: string,
  signal?: AbortSignal,
): Promise<GlossToken[] | null> {
  const key = text.trim().toLowerCase();
  const cache = loadLocalCache();
  if (cache[key]) return cache[key];

  try {
    const res = await fetch("/api/glossify-llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = llmResponseSchema.safeParse(data);
    if (!parsed.success) return null;
    cache[key] = parsed.data;
    saveLocalCache(cache);
    return parsed.data;
  } catch {
    return null;
  }
}
