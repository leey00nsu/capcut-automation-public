import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";

import { estimatePlanUsageCost } from "@/lib/ai/usage";
import type { PlanUsage } from "@/types/planner";

const execFileAsync = promisify(execFile);
const CODEX_STATE_DB_PATH = join(homedir(), ".codex", "state_5.sqlite");

type CodexThreadRow = {
  id: string;
  model: string | null;
  reasoning_effort: string | null;
  tokens_used: number;
  first_user_message: string;
  created_at_ms: number | null;
};

export async function readLatestCodexExecUsage(input: {
  prompt: string;
  startedAtMs: number;
  model: string;
  cwd?: string;
}): Promise<PlanUsage | undefined> {
  const queryStartMs = Math.max(0, input.startedAtMs - 30_000);
  const query = [
    "select",
    "id,",
    "model,",
    "reasoning_effort,",
    "tokens_used,",
    "first_user_message,",
    "created_at_ms",
    "from threads",
    "where source = 'exec'",
    `and cwd = '${(input.cwd ?? process.cwd()).replace(/'/g, "''")}'`,
    `and created_at_ms >= ${queryStartMs}`,
    "order by created_at_ms desc",
    "limit 12;",
  ].join(" ");

  try {
    const { stdout } = await execFileAsync("sqlite3", [
      "-json",
      CODEX_STATE_DB_PATH,
      query,
    ]);
    const rows = JSON.parse(stdout || "[]") as CodexThreadRow[];
    const promptPrefix = input.prompt.trim().slice(0, 120);
    const matched =
      rows.find((row) => row.first_user_message.startsWith(promptPrefix)) ??
      rows[0];

    if (!matched || !Number.isFinite(matched.tokens_used) || matched.tokens_used <= 0) {
      return undefined;
    }

    return estimatePlanUsageCost({
      provider: "codex",
      model: matched.model?.trim() || input.model.trim() || "gpt-5.4",
      totalTokens: matched.tokens_used,
      ...(matched.reasoning_effort?.trim()
        ? { reasoningEffort: matched.reasoning_effort.trim() }
        : {}),
      threadId: matched.id,
    });
  } catch {
    return undefined;
  }
}
