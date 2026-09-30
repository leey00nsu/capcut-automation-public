import { access, cp } from "node:fs/promises";

async function ensureDestinationDoesNotExist(
  outputProjectPath: string,
): Promise<void> {
  try {
    await access(outputProjectPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }

    throw error;
  }

  throw new Error(
    `Destination project directory already exists: ${outputProjectPath}`,
  );
}

export async function cloneTemplateProject(
  templateProjectPath: string,
  outputProjectPath: string,
): Promise<void> {
  await ensureDestinationDoesNotExist(outputProjectPath);

  await cp(templateProjectPath, outputProjectPath, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
}
