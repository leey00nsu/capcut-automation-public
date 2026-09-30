import { access, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureReadableFilePath } from "@/lib/files/paths";
import { analyzeVrewPremiereXml } from "@/lib/premiere/vrew-xml";
import type { VrewHighlightAnalysis } from "@/types/premiere";

export const runtime = "nodejs";

const presetSchema = z.enum(["5", "10", "15", "custom"]);

const requestSchema = z
  .object({
    xmlPath: z.string().trim().min(1, "XML 경로를 입력하세요."),
    durationPreset: presetSchema.default("10"),
    customDurationSeconds: z.number().finite().optional(),
  })
  .superRefine((value, context) => {
    if (value.durationPreset !== "custom") {
      return;
    }

    if (
      typeof value.customDurationSeconds !== "number" ||
      value.customDurationSeconds <= 0 ||
      value.customDurationSeconds > 120
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customDurationSeconds"],
        message: "직접 입력 하이라이트 길이는 1초 이상 120초 이하로 입력하세요.",
      });
    }
  });

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

function resolveHighlightDurationSeconds(input: {
  durationPreset: z.infer<typeof presetSchema>;
  customDurationSeconds?: number;
}): number {
  if (input.durationPreset === "custom") {
    return input.customDurationSeconds ?? 10;
  }

  return Number(input.durationPreset);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveSourceVideoPath(
  analysis: VrewHighlightAnalysis,
  xmlPath: string,
): Promise<string> {
  if (await pathExists(analysis.sourceVideoPath)) {
    return analysis.sourceVideoPath;
  }

  const colocatedPath = join(dirname(xmlPath), basename(analysis.sourceVideoPath));

  if (await pathExists(colocatedPath)) {
    return colocatedPath;
  }

  return analysis.sourceVideoPath;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError(400, "INVALID_INPUT", "Request body must be valid JSON");
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      400,
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid request body",
    );
  }

  try {
    const xmlPath = await ensureReadableFilePath(parsed.data.xmlPath, "Vrew XML path");
    const rawXml = await readFile(xmlPath, "utf8");
    const highlightDurationSeconds = resolveHighlightDurationSeconds(parsed.data);
    const analysis = analyzeVrewPremiereXml(rawXml, {
      highlightDurationSeconds,
    });
    const sourceVideoPath = await resolveSourceVideoPath(analysis, xmlPath);

    return NextResponse.json({
      xmlPath,
      durationPreset: parsed.data.durationPreset,
      highlightDurationSeconds,
      analysis: {
        ...analysis,
        sourceVideoPath,
      },
    });
  } catch (error) {
    return jsonError(
      400,
      "INVALID_INPUT",
      error instanceof Error ? error.message : "Vrew XML 분석에 실패했습니다.",
    );
  }
}
