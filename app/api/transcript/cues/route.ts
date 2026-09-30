import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { ensureReadableFilePath } from "@/lib/files/paths";
import { parseTranscriptCues } from "@/lib/subtitles/cues";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const path = new URL(request.url).searchParams.get("path") ?? "";
    const resolved = await ensureReadableFilePath(path, "transcript path");
    return NextResponse.json({ cues: parseTranscriptCues(await readFile(resolved, "utf8")) });
  } catch (error) {
    return NextResponse.json({ error: { code: "INVALID_TRANSCRIPT", message: error instanceof Error ? error.message : "전사본을 읽을 수 없습니다." } }, { status: 400 });
  }
}
