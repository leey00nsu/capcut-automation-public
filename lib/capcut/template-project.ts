import { join } from "node:path";

export const BUILT_IN_TEMPLATE_RELATIVE_PATH = join(
  "templates",
  "capcut",
  "base-template",
);

export function getBuiltInTemplateProjectPath(
  rootDirectory = process.cwd(),
): string {
  return join(rootDirectory, BUILT_IN_TEMPLATE_RELATIVE_PATH);
}
