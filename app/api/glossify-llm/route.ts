import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LLM_TIMEOUT_MS = 20_000;
// gpt-5-mini: a step up from gpt-4.1 on ISL grammar reasoning without the
// multi-second reasoning chain that makes gpt-5 full feel unusable here.
const MODEL = "gpt-5-mini";

// --- Schema -----------------------------------------------------------------

const nmmSchema = z
  .enum(["wh", "neg", "yn"])
  .nullable()
  .transform((v) => v ?? undefined);

const responseSchema = z
  .object({
    glossed: z.array(z.string().min(1).max(40).transform((s) => s.toUpperCase())),
    nmms: z.array(nmmSchema),
  })
  .refine((d) => d.glossed.length === d.nmms.length, {
    message: "glossed and nmms must have equal length",
  });

export type LlmGlossResponse = z.infer<typeof responseSchema>;

const openAiJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["glossed", "nmms"],
  properties: {
    glossed: {
      type: "array",
      items: { type: "string" },
    },
    nmms: {
      type: "array",
      items: {
        type: ["string", "null"],
        enum: ["wh", "neg", "yn", null],
      },
    },
  },
} as const;

// --- Prompt -----------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert Indian Sign Language (ISL) linguist.
Convert the input English OR Hindi sentence into an ISL gloss sequence.

ISL GRAMMAR RULES (apply in priority order):
1. Topic-comment + SOV: move the object before the verb.
   "I eat rice" → I RICE EAT.
2. Time words to sentence-front: YESTERDAY / TODAY / TOMORROW / NOW lead.
   "I will go home tomorrow" → TOMORROW I HOME GO.
3. WH words move to sentence-end and tag nmm="wh":
   what/who/where/when/why/how → final position.
   "What is your name?" → YOUR NAME WHAT (nmm=wh on WHAT).
4. Negation moves to sentence-end as NOT with nmm="neg".
   "I don't know you" → I YOU KNOW NOT (nmm=neg on NOT).
5. Yes/No questions: no word change, tag final token nmm="yn".
6. Drop articles (a/an/the) and copulas (is/am/are/was/were/be) when redundant.
7. Lemmatize verbs (eating→EAT, went→GO, running→RUN).
8. Simplify possessives to juxtaposition:
   "my mother's house" → MY MOTHER HOUSE.
9. Plurals: number-prefix the noun in singular form.
   "I have two friends" → I FRIEND TWO HAVE.

PREFER these captured glosses when semantically equivalent
(our avatar has real mocap for these):
HELLO, THANK-YOU, I, MY, YOU, FRIEND, NAME, WATER, WANT, WHAT, SEE, YES, NO.

OUTPUT FORMAT:
- glossed: array of single-word uppercase English glosses.
  Keep each gloss atomic. Do NOT hyphenate arbitrary compounds.
  The ONLY allowed hyphenated glosses are fixed ISL compounds: THANK-YOU.
  "good morning" → ["GOOD","MORNING"] (two entries), not ["GOOD-MORNING"].
  "your name" → ["YOUR","NAME"] (two entries).
- nmms: array of equal length, each entry one of "wh" | "neg" | "yn" | null.

Respect input language — translate Hindi to ISL via SEMANTIC, not literal mapping.
Example: "आपका नाम क्या है?" → glossed: ["YOUR","NAME","WHAT"], nmms: [null,null,"wh"].

Return ONLY the JSON, no prose.`;

// --- Cache ------------------------------------------------------------------

const cache = new Map<string, LlmGlossResponse>();
const CACHE_MAX = 100;

function cacheGet(key: string): LlmGlossResponse | null {
  const k = key.trim().toLowerCase();
  const hit = cache.get(k);
  if (!hit) return null;
  cache.delete(k);
  cache.set(k, hit);
  return hit;
}
function cacheSet(key: string, value: LlmGlossResponse) {
  const k = key.trim().toLowerCase();
  if (cache.has(k)) cache.delete(k);
  cache.set(k, value);
  while (cache.size > CACHE_MAX) {
    const first = cache.keys().next();
    if (first.done) break;
    cache.delete(first.value);
  }
}

// --- Handler ----------------------------------------------------------------

type RequestBody = { text?: string; lang?: string };

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not set on server" },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "'text' field required" }, { status: 400 });
  }
  if (text.length > 500) {
    return NextResponse.json({ error: "text too long (max 500)" }, { status: 413 });
  }

  const cached = cacheGet(text);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  const openai = new OpenAI({ apiKey });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const completion = await openai.chat.completions.create(
      {
        model: MODEL,
        // gpt-5 only accepts the default temperature; omit to avoid 400.
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "isl_gloss",
            strict: true,
            schema: openAiJsonSchema as unknown as Record<string, unknown>,
          },
        },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      },
      { signal: controller.signal },
    );
    clearTimeout(timeoutId);

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) {
      return NextResponse.json({ error: "empty LLM response" }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "LLM returned non-JSON", raw: raw.slice(0, 200) },
        { status: 502 },
      );
    }
    const validated = responseSchema.safeParse(parsed);
    if (!validated.success) {
      return NextResponse.json(
        { error: "schema validation failed", issues: validated.error.issues },
        { status: 502 },
      );
    }
    cacheSet(text, validated.data);
    return NextResponse.json({ ...validated.data, cached: false });
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort =
      err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    const message = err instanceof Error ? err.message : "LLM call failed";
    console.error("[/api/glossify-llm]", message);
    return NextResponse.json(
      { error: message },
      { status: isAbort ? 504 : 502 },
    );
  }
}
