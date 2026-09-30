import plannerDefaults from "@/config/planner-defaults.json";
import type {
  HookTextFewShotExample,
  PlannerPromptInput,
} from "@/types/planner";

export const DEFAULT_PLANNER_PROMPT_INSTRUCTIONS =
  plannerDefaults.promptInstructions.join("\n");

export const DEFAULT_HOOK_TEXT_FEW_SHOT_EXAMPLES: readonly HookTextFewShotExample[] =
  plannerDefaults.fewShotExamples;

export function buildHookTextFewShotPrompt(
  examples: readonly HookTextFewShotExample[],
): string {
  return [
    "문구 형식 예시 (few-shot):",
    "아래 예시는 [강조 1행, 일반 2행] 조합의 작성 방식만 보여 준다.",
    "문구를 그대로 복사하지 말고 길이, 말투, 구체성, 궁금증을 만드는 방식만 학습해 새 문구를 작성해라.",
    ...examples.map(
      (example, index) =>
        `${String(index + 1).padStart(3, "0")}. [${JSON.stringify(example.highlight)}, ${JSON.stringify(example.general)}]`,
    ),
  ].join("\n");
}

function buildCandidatePlaceholders(count: number): string {
  return `[${Array.from({ length: count }, () => '"..."').join(", ")}]`;
}

function buildPromptLines(input: PlannerPromptInput): string[] {
  const fewShotExamples =
    input.fewShotExamples ?? DEFAULT_HOOK_TEXT_FEW_SHOT_EXAMPLES;

  return [
    input.promptInstructions?.trim() || DEFAULT_PLANNER_PROMPT_INSTRUCTIONS,
    "",
    buildHookTextFewShotPrompt(fewShotExamples),
    "",
    "출력 규칙:",
    "- 반드시 JSON만 출력하고 설명문, 마크다운, 코드블록은 출력하지 마라.",
    `- clips는 정확히 ${input.settings.clipCount}개여야 한다.`,
    "- clips는 시작 시간 기준 오름차순이어야 한다.",
    "- source는 입력값을 그대로 반영해야 한다.",
    "- start와 end는 HH:MM:SS.mmm 형식이어야 한다.",
    "- 각 clip의 start는 end보다 반드시 앞서야 한다.",
    `- 각 clip 길이는 반드시 ${input.settings.minClipDurationSeconds}초 이상 ${input.settings.maxClipDurationSeconds}초 이하여야 한다.`,
    `- 각 clip마다 상단 하이라이트 후보는 정확히 ${input.settings.subtitleCandidateCount}개여야 한다.`,
    `- 각 clip마다 상단 일반 자막 후보는 정확히 ${input.settings.subtitleCandidateCount}개여야 한다.`,
    "- 추천 이유는 왜 이 구간이 쇼츠로 적합한지 짧게 설명해라.",
    "",
    "출력은 다음 JSON 구조를 정확히 따라라.",
    "{",
    '  "source": {',
    '    "videoPath": "...",',
    '    "transcriptPath": "...",',
    '    "channelName": "...",',
    '    "originalTitle": "..."',
    '  },',
    '  "clips": [',
    "    {",
    '      "id": "short-001",',
    '      "start": "00:00:00.000",',
    '      "end": "00:00:00.000",',
    '      "reason": "...",',
    `      "topHighlightCandidates": ${buildCandidatePlaceholders(input.settings.subtitleCandidateCount)},`,
    `      "topGeneralCandidates": ${buildCandidatePlaceholders(input.settings.subtitleCandidateCount)}`,
    "    }",
    "  ]",
    "}",
    "",
    `채널명: ${input.channelName}`,
    `원본 영상 제목: ${input.originalTitle}`,
    `비디오 경로: ${input.videoPath}`,
    `전사 경로: ${input.transcriptPath}`,
    "",
    "전사 시작 <<<",
    input.transcript,
    "전사 끝 >>>",
  ];
}

export function buildPlannerPrompt(input: PlannerPromptInput): string {
  return buildPromptLines(input).join("\n");
}
