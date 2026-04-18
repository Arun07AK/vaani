import { z } from "zod";

/**
 * VRM humanoid bone names the LLM is allowed to address.
 * Keep this set tight — the LLM should pick from here, and unknown
 * names are dropped during validation.
 */
export const BONE_NAMES = [
  "head",
  "neck",
  "spine",
  "chest",
  "upperChest",
  "hips",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftThumbProximal",
  "leftThumbIntermediate",
  "leftThumbDistal",
  "leftIndexProximal",
  "leftIndexIntermediate",
  "leftIndexDistal",
  "leftMiddleProximal",
  "leftMiddleIntermediate",
  "leftMiddleDistal",
  "leftRingProximal",
  "leftRingIntermediate",
  "leftRingDistal",
  "leftLittleProximal",
  "leftLittleIntermediate",
  "leftLittleDistal",
  "rightThumbProximal",
  "rightThumbIntermediate",
  "rightThumbDistal",
  "rightIndexProximal",
  "rightIndexIntermediate",
  "rightIndexDistal",
  "rightMiddleProximal",
  "rightMiddleIntermediate",
  "rightMiddleDistal",
  "rightRingProximal",
  "rightRingIntermediate",
  "rightRingDistal",
  "rightLittleProximal",
  "rightLittleIntermediate",
  "rightLittleDistal",
] as const;

export type BoneName = (typeof BONE_NAMES)[number];

const BONE_SET = new Set<string>(BONE_NAMES);

const eulerTuple = z
  .tuple([z.number(), z.number(), z.number()])
  .transform((v) => [clamp(v[0]), clamp(v[1]), clamp(v[2])] as [number, number, number]);

function clamp(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x > Math.PI) return Math.PI;
  if (x < -Math.PI) return -Math.PI;
  return x;
}

const bonesRecord = z
  .record(z.string(), eulerTuple)
  .transform((record) => {
    const filtered: Record<string, [number, number, number]> = {};
    for (const [k, v] of Object.entries(record)) {
      if (BONE_SET.has(k)) filtered[k] = v;
    }
    return filtered as Partial<Record<BoneName, [number, number, number]>>;
  });

const keyframeSchema = z.object({
  t: z.number().min(0).max(1),
  bones: bonesRecord,
});

const signSchema = z
  .object({
    gloss: z.string().min(1).max(40).transform((s) => s.toUpperCase()),
    nmm: z.enum(["wh", "neg", "yn"]).optional(),
    durationMs: z.number().min(300).max(3500).transform((n) => Math.round(n)),
    keyframes: z.array(keyframeSchema).min(1).max(8),
  })
  .transform((sign) => {
    // Ensure keyframes start at t=0 and end at t=1, and are monotonic.
    const frames = [...sign.keyframes].sort((a, b) => a.t - b.t);
    if (frames[0].t > 0.01) frames.unshift({ t: 0, bones: {} });
    if (frames[frames.length - 1].t < 0.99)
      frames.push({ t: 1, bones: frames[frames.length - 1].bones });
    return { ...sign, keyframes: frames };
  });

export const animationSpecSchema = z.object({
  sentence: z.string(),
  glossed: z.array(z.string()).min(1).max(20),
  signs: z.array(signSchema).min(1).max(20),
});

export type Keyframe = z.infer<typeof keyframeSchema>;
export type SignAnim = z.infer<typeof signSchema>;
export type AnimationSpec = z.infer<typeof animationSpecSchema>;

export function parseAnimationSpec(raw: unknown): AnimationSpec | null {
  const res = animationSpecSchema.safeParse(raw);
  if (!res.success) return null;
  return res.data;
}

/** Simple in-memory LRU cache keyed by lowercased sentence. */
export class SentenceCache {
  private map = new Map<string, AnimationSpec>();
  private readonly max: number;
  constructor(max = 50) {
    this.max = max;
  }
  get(key: string): AnimationSpec | null {
    const k = key.trim().toLowerCase();
    const v = this.map.get(k);
    if (v === undefined) return null;
    // Refresh recency
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(key: string, value: AnimationSpec) {
    const k = key.trim().toLowerCase();
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, value);
    while (this.map.size > this.max) {
      const first = this.map.keys().next();
      if (first.done) break;
      this.map.delete(first.value);
    }
  }
}

/**
 * JSON schema the OpenAI structured-output API enforces.
 * Strict mode: additionalProperties=false everywhere.
 * Note: we express bone rotations as an object with fixed optional keys so
 * the LLM stays on the bone enum.
 */
export function buildOpenAIJsonSchema() {
  const boneProps: Record<string, unknown> = {};
  for (const name of BONE_NAMES) {
    boneProps[name] = {
      type: "array",
      items: { type: "number" },
      minItems: 3,
      maxItems: 3,
      description: "XYZ Euler rotation in radians",
    };
  }
  return {
    type: "object",
    additionalProperties: false,
    required: ["sentence", "glossed", "signs"],
    properties: {
      sentence: { type: "string" },
      glossed: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 20,
      },
      signs: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["gloss", "durationMs", "keyframes"],
          properties: {
            gloss: { type: "string" },
            nmm: { type: "string", enum: ["wh", "neg", "yn"] },
            durationMs: { type: "number" },
            keyframes: {
              type: "array",
              minItems: 1,
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["t", "bones"],
                properties: {
                  t: { type: "number" },
                  bones: {
                    type: "object",
                    additionalProperties: false,
                    properties: boneProps,
                  },
                },
              },
            },
          },
        },
      },
    },
  } as const;
}
