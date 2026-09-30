import { NextResponse } from "next/server";

import { parseStoredPlannerOptions } from "@/lib/planner/options";
import { ensureReadableFilePath } from "@/lib/files/paths";
import { readSubtitleFont } from "@/lib/subtitles/render";
import {
  loadPlannerOptions,
  savePlannerOptions,
} from "@/lib/planner/options-store";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await loadPlannerOptions());
}

export async function PUT(request: Request): Promise<NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Request body must be valid JSON",
        },
      },
      { status: 400 },
    );
  }

  const options = parseStoredPlannerOptions(JSON.stringify(body));

  if (!options) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid planner options" } },
      { status: 400 },
    );
  }

  if (options.subtitleStyle.fontSource === "local") {
    try {
      if (!/\.(otf|ttf)$/i.test(options.subtitleStyle.fontPath)) throw new Error("OTF 또는 TTF 폰트 파일을 선택하세요.");
      await readSubtitleFont(await ensureReadableFilePath(options.subtitleStyle.fontPath, "subtitle font path"));
    } catch (error) {
      return NextResponse.json({ error: { code: "INVALID_FONT", message: error instanceof Error ? error.message : "폰트를 읽을 수 없습니다." } }, { status: 400 });
    }
  }

  return NextResponse.json(await savePlannerOptions(options));
}
