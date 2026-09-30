import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getBuiltInTemplateProjectPath } from "@/lib/capcut/template-project";

describe("built-in CapCut template", () => {
  it("ships a combination subdraft asset referenced by draft_meta_info", async () => {
    const templateProjectPath = getBuiltInTemplateProjectPath();
    const draftMetaInfo = JSON.parse(
      await readFile(join(templateProjectPath, "draft_meta_info.json"), "utf8"),
    ) as {
      draft_materials?: Array<{
        type: number;
        value: Array<{
          file_Path?: string;
          metetype?: string;
          id?: string;
        }>;
      }>;
    };
    const draftVirtualStore = JSON.parse(
      await readFile(join(templateProjectPath, "draft_virtual_store.json"), "utf8"),
    ) as {
      draft_virtual_store?: Array<{
        type: number;
        value: Array<{ child_id?: string }>;
      }>;
    };

    const combinationMaterials =
      draftMetaInfo.draft_materials?.find((entry) => entry.type === 18)?.value ?? [];
    const typeZeroMaterials =
      draftMetaInfo.draft_materials?.find((entry) => entry.type === 0)?.value ?? [];
    const combinationFilePath = combinationMaterials.find(
      (entry) => entry.metetype === "combination",
    )?.file_Path;
    const placeholderMaterial = typeZeroMaterials.find(
      (entry) => entry.metetype === "none",
    );
    const projectMediaStore =
      draftVirtualStore.draft_virtual_store?.find((entry) => entry.type === 1)?.value ?? [];

    expect(combinationFilePath).toBe(
      "./subdraft/EDA282C5-9C0B-4B3D-9728-975D74B59F57/sub_draft_config.json",
    );
    expect(placeholderMaterial).toMatchObject({
      id: "cd484075-d92a-4bc9-b45c-d093d2f9e71b",
      metetype: "none",
      file_Path: "",
    });
    expect(projectMediaStore).toEqual([
      { child_id: "cd484075-d92a-4bc9-b45c-d093d2f9e71b", parent_id: "" },
      { child_id: "79aa9c9b-ed42-45f7-91e3-5c001dbc9d76", parent_id: "" },
    ]);

    await expect(
      access(
        join(
          templateProjectPath,
          "subdraft",
          "EDA282C5-9C0B-4B3D-9728-975D74B59F57",
          "sub_draft_config.json",
        ),
      ),
    ).resolves.toBeUndefined();
    await expect(
      access(
        join(
          templateProjectPath,
          "subdraft",
          "EDA282C5-9C0B-4B3D-9728-975D74B59F57",
          "draft_content.json",
        ),
      ),
    ).resolves.toBeUndefined();
    await expect(
      access(
        join(
          templateProjectPath,
          "subdraft",
          "EDA282C5-9C0B-4B3D-9728-975D74B59F57",
          "draft_cover.jpg",
        ),
      ),
    ).resolves.toBeUndefined();
  });
});
