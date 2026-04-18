import type { GlossToken } from "./stores/pipeline";

export type SignEntryType = "clip" | "video" | "pose" | "alphabet";

export type SignEntry = {
  gloss: string;
  type: SignEntryType;
  source: string;
  durationMs: number;
  handedness?: "L" | "R" | "LR";
  nmmHint?: string;
};

let cache: Map<string, SignEntry> | null = null;

function parseCsv(text: string): SignEntry[] {
  const lines = text.trim().split(/\r?\n/);
  const [header, ...rows] = lines;
  const cols = header.split(",").map((c) => c.trim());
  const idx = (name: string) => cols.indexOf(name);
  const iGloss = idx("gloss");
  const iType = idx("type");
  const iSrc = idx("source");
  const iDur = idx("duration_ms");
  const iHand = idx("handedness");
  const iNmm = idx("nmm_hint");
  return rows
    .filter((r) => r.trim().length > 0)
    .map((row) => {
      const cells = row.split(",");
      return {
        gloss: cells[iGloss]?.trim() ?? "",
        type: (cells[iType]?.trim() || "clip") as SignEntryType,
        source: cells[iSrc]?.trim() ?? "",
        durationMs: Number(cells[iDur]?.trim() || 1200),
        handedness: (cells[iHand]?.trim() || undefined) as SignEntry["handedness"],
        nmmHint: cells[iNmm]?.trim() || undefined,
      };
    });
}

export async function loadLexicon(): Promise<Map<string, SignEntry>> {
  if (cache) return cache;
  const res = await fetch("/signs/isl.csv", { cache: "force-cache" });
  if (!res.ok) throw new Error(`failed to load lexicon: ${res.status}`);
  const text = await res.text();
  const entries = parseCsv(text);
  const map = new Map<string, SignEntry>();
  for (const e of entries) map.set(e.gloss, e);
  cache = map;
  return map;
}

export function resolveSign(
  token: GlossToken,
  lexicon: Map<string, SignEntry>,
): { entry: SignEntry; isOOV: boolean } {
  const entry = lexicon.get(token.text);
  if (entry) return { entry, isOOV: false };
  const unknown = lexicon.get("UNKNOWN_GESTURE");
  if (unknown) return { entry: unknown, isOOV: true };
  return {
    entry: {
      gloss: token.text,
      type: "clip",
      source: "shrug",
      durationMs: 1000,
    },
    isOOV: true,
  };
}
