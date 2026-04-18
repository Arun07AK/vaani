import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  parseAnimationSpec,
  SentenceCache,
  buildOpenAIJsonSchema,
  type AnimationSpec,
} from "@/lib/animationSpec";
import { SIGN_SYSTEM_PROMPT } from "@/lib/signPrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LLM_TIMEOUT_MS = 12_000;
const MODEL = "gpt-4o-mini";
const cache = new SentenceCache(50);

type RequestBody = { text?: string };

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
  if (text.length > 400) {
    return NextResponse.json({ error: "text too long (max 400)" }, { status: 413 });
  }

  const cached = cache.get(text);
  if (cached) {
    return NextResponse.json(
      { spec: cached, cached: true },
      { headers: { "x-vaani-cache": "hit" } },
    );
  }

  const openai = new OpenAI({ apiKey });
  const schema = buildOpenAIJsonSchema();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const completion = await openai.chat.completions.create(
      {
        model: MODEL,
        temperature: 0.3,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "animation_spec",
            strict: true,
            schema: schema as unknown as Record<string, unknown>,
          },
        },
        messages: [
          { role: "system", content: SIGN_SYSTEM_PROMPT },
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

    const spec: AnimationSpec | null = parseAnimationSpec(parsed);
    if (!spec) {
      return NextResponse.json(
        { error: "LLM output failed schema validation" },
        { status: 502 },
      );
    }
    cache.set(text, spec);
    return NextResponse.json({ spec, cached: false });
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort =
      err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    const message = err instanceof Error ? err.message : "LLM call failed";
    console.error("[/api/sign-from-text]", message);
    return NextResponse.json(
      { error: message },
      { status: isAbort ? 504 : 502 },
    );
  }
}
