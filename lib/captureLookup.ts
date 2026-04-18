type Manifest = Record<string, string>; // GLOSS (uppercase) -> /signs/captures/GLOSS.json

let cached: Manifest | null = null;

export async function loadCaptureManifest(): Promise<Manifest> {
  if (cached) return cached;
  try {
    const res = await fetch("/signs/captures/manifest.json", {
      cache: "force-cache",
    });
    if (!res.ok) {
      cached = {};
      return cached;
    }
    const data = (await res.json()) as Manifest;
    // Upper-case all keys for case-insensitive lookup.
    const norm: Manifest = {};
    for (const [k, v] of Object.entries(data)) norm[k.toUpperCase()] = v;
    cached = norm;
    return cached;
  } catch {
    cached = {};
    return cached;
  }
}

export function lookupCapture(gloss: string, manifest: Manifest): string | null {
  const url = manifest[gloss.toUpperCase()];
  return url ?? null;
}
