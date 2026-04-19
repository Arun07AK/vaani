import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB (OpenAI Whisper limit)

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not set on server" },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart form-data" }, { status: 400 });
  }

  const audio = formData.get("audio");
  if (!audio || typeof audio === "string") {
    return NextResponse.json({ error: "'audio' field missing or not a file" }, { status: 400 });
  }
  // audio is a File or Blob per FormDataEntryValue.
  const asBlob = audio as unknown as Blob & { name?: string };
  if (asBlob.size === 0) {
    return NextResponse.json({ error: "empty audio payload" }, { status: 400 });
  }
  if (asBlob.size > MAX_BYTES) {
    return NextResponse.json({ error: "audio too large (>25MB)" }, { status: 413 });
  }

  const fileName = asBlob.name || "audio.webm";
  const fileType = asBlob.type || "audio/webm";
  const uploadFile = new File([asBlob], fileName, { type: fileType });

  const langField = formData.get("lang");
  // Whisper wants ISO 639-1 ("en", "hi"), not region-suffixed codes ("en-IN").
  // Accept both shapes from clients and strip anything after the first hyphen.
  const langRaw =
    typeof langField === "string" && langField.trim() ? langField.trim() : undefined;
  const lang = langRaw ? langRaw.split(/[-_]/)[0].toLowerCase() : undefined;

  const openai = new OpenAI({ apiKey });
  try {
    const result = await openai.audio.transcriptions.create({
      file: uploadFile,
      model: "whisper-1",
      ...(lang ? { language: lang } : {}),
      response_format: "json",
    });
    return NextResponse.json({ transcript: result.text, language: lang ?? "auto" }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "transcription failed";
    console.error("[/api/transcribe] OpenAI error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
