import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectGenerationRequest } from "@/types/project";

const { manifestFailureState } = vi.hoisted(() => ({
  manifestFailureState: {
    message: null as string | null,
  },
}));

const { cloneFailureState } = vi.hoisted(() => ({
  cloneFailureState: {
    error: null as Error | null,
  },
}));

const { builtInTemplatePathState } = vi.hoisted(() => ({
  builtInTemplatePathState: {
    value: "",
  },
}));

const { capCutProjectsRootPathState } = vi.hoisted(() => ({
  capCutProjectsRootPathState: {
    value: "",
  },
}));

const { mediaMetadataState } = vi.hoisted(() => ({
  mediaMetadataState: {
    video: {
      width: 1920,
      height: 1080,
      hasAudio: true,
      durationUnits: 1_002_900_000,
    },
    image: {
      width: 176,
      height: 176,
      hasAudio: false,
    },
  },
}));

vi.mock("@/lib/runs/manifest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/runs/manifest")>();

  return {
    ...actual,
    writeRunManifest: vi.fn(async (...args: Parameters<typeof actual.writeRunManifest>) => {
      if (manifestFailureState.message) {
        throw new Error(manifestFailureState.message);
      }

      const manifestPath = await actual.writeRunManifest(...args);
      createdRunManifestPaths.add(manifestPath);
      return manifestPath;
    }),
  };
});

vi.mock("@/lib/capcut/clone-template", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/capcut/clone-template")>();

  return {
    ...actual,
    cloneTemplateProject: vi.fn(
      async (...args: Parameters<typeof actual.cloneTemplateProject>) => {
        if (cloneFailureState.error) {
          const error = cloneFailureState.error;
          cloneFailureState.error = null;
          throw error;
        }

        return actual.cloneTemplateProject(...args);
      },
    ),
  };
});

vi.mock("@/lib/capcut/template-project", () => ({
  getBuiltInTemplateProjectPath: () => builtInTemplatePathState.value,
}));

vi.mock("@/lib/capcut/template-defaults", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/capcut/template-defaults")>();

  return {
    ...actual,
    getCapCutProjectsRootPath: () => capCutProjectsRootPathState.value,
  };
});

vi.mock("@/lib/media/file-metadata", () => ({
  getMediaFileMetadata: vi.fn(async (filePath: string) =>
    filePath.endsWith(".png") || filePath.endsWith(".jpg")
      ? mediaMetadataState.image
      : mediaMetadataState.video,
  ),
}));

const { POST } = await import("@/app/api/projects/generate/route");
const { cloneTemplateProject } = await import("@/lib/capcut/clone-template");
const runsDirectory = join(process.env.CAPCUT_AUTOMATION_DATA_ROOT ?? process.cwd(), "runs");
const createdRunManifestPaths = new Set<string>();

async function cleanupCreatedRunManifests(): Promise<void> {
  await Promise.all(
    Array.from(createdRunManifestPaths, (manifestPath) =>
      rm(manifestPath, { force: true }),
    ),
  );
  createdRunManifestPaths.clear();
}

afterEach(async () => {
  await cleanupCreatedRunManifests();
});

beforeEach(() => {
  vi.clearAllMocks();
  manifestFailureState.message = null;
  cloneFailureState.error = null;
  builtInTemplatePathState.value = "";
  capCutProjectsRootPathState.value = "";
  mediaMetadataState.video = {
    width: 1920,
    height: 1080,
    hasAudio: true,
    durationUnits: 1_002_900_000,
  };
  mediaMetadataState.image = {
    width: 176,
    height: 176,
    hasAudio: false,
  };
});

async function createGenerationFixture(): Promise<{
  rootDir: string;
  templateProjectPath: string;
  outputRootPath: string;
  videoPath: string;
  profileImagePath: string;
}> {
  const rootDir = await mkdtemp(join(tmpdir(), "capcut-project-generate-"));
  const templateProjectPath = join(rootDir, "template-project");
  const outputRootPath = join(
    rootDir,
    "User Data",
    "Projects",
    "com.lveditor.draft",
  );
  const videoPath = join(rootDir, "video.mp4");
  const profileImagePath = join(rootDir, "channel-profile.png");

  await mkdir(templateProjectPath, { recursive: true });
  await mkdir(outputRootPath, { recursive: true });
  await writeFile(videoPath, "fake video", "utf8");
  await writeFile(profileImagePath, "fake image", "utf8");
  await cp(
    join(process.cwd(), "tests/fixtures/capcut/template-draft-info.json"),
    join(templateProjectPath, "draft_info.json"),
  );
  await cp(
    join(process.cwd(), "tests/fixtures/capcut/template-draft-meta-info.json"),
    join(templateProjectPath, "draft_meta_info.json"),
  );
  const templateDraftMetaInfoPath = join(templateProjectPath, "draft_meta_info.json");
  const templateDraftMetaInfo = JSON.parse(
    await readFile(templateDraftMetaInfoPath, "utf8"),
  ) as {
    draft_id?: string;
    tm_duration?: number;
    draft_timeline_materials_size_?: number;
    draft_materials?: Array<{ type: number; value: unknown[] }>;
  };
  templateDraftMetaInfo.draft_id = "TEMPLATE-DRAFT-ID";
  templateDraftMetaInfo.tm_duration = 27_433_333;
  templateDraftMetaInfo.draft_timeline_materials_size_ = 123_456_789;
  templateDraftMetaInfo.draft_materials = [
    ...(templateDraftMetaInfo.draft_materials ?? []),
    {
      type: 18,
      value: [
        {
          id: "BC7D8416-106C-47DB-8170-C75C1F03CCFD",
          metetype: "combination",
          file_Path: "./subdraft/EDA282C5-9C0B-4B3D-9728-975D74B59F57/sub_draft_config.json",
          extra_info: "복합 클립1",
          create_time: 1111111111,
          import_time: 1111111111,
          import_time_ms: 1111111111111111,
          roughcut_time_range: {
            start: 0,
            duration: 12_000_000,
          },
          sub_time_range: {
            start: -1,
            duration: -1,
          },
        },
      ],
    },
  ];
  await writeFile(
    templateDraftMetaInfoPath,
    JSON.stringify(templateDraftMetaInfo, null, 2),
    "utf8",
  );
  await cp(
    join(process.cwd(), "tests/fixtures/capcut/template-draft-agency-config.json"),
    join(templateProjectPath, "draft_agency_config.json"),
  );
  await mkdir(
    join(
      templateProjectPath,
      "subdraft",
      "EDA282C5-9C0B-4B3D-9728-975D74B59F57",
    ),
    { recursive: true },
  );
  await writeFile(
    join(
      templateProjectPath,
      "subdraft",
      "EDA282C5-9C0B-4B3D-9728-975D74B59F57",
      "draft_content.json",
    ),
    JSON.stringify(
      {
        name: "복합 클립1",
        materials: {
          videos: [
            {
              id: "SUBDRAFT-VIDEO",
              path: "/Users/test/Videos/template-source.mov",
              duration: 555_000_000,
              material_name: "template-source.mov",
              local_material_id: "SUBDRAFT-TEMPLATE-LOCAL-ID",
              category_name: "",
              is_copyright: true,
              width: 1280,
              height: 720,
              has_audio: false,
            },
            {
              id: "SUBDRAFT-PHOTO",
              path: "/Users/test/Images/template-profile.png",
              duration: 10_800_000_000,
              material_name: "template-profile.png",
              local_material_id: "PROFILE-LOCAL-ID",
              category_name: "",
              is_copyright: true,
              width: 100,
              height: 100,
              has_audio: true,
            },
          ],
        },
        draft_materials: [
          {
            type: 0,
            value: [
              {
                metetype: "photo",
                file_Path: "/Users/test/Images/template-profile.png",
                extra_info: "template-profile.png",
                duration: 10_800_000_000,
                width: 100,
                height: 100,
                roughcut_time_range: {
                  start: -1,
                  duration: -1,
                },
              },
              {
                metetype: "video",
                file_Path: "/Users/test/Videos/template-source.mov",
                extra_info: "template-source.mov",
                duration: 555_000_000,
                width: 1280,
                height: 720,
                roughcut_time_range: {
                  start: 0,
                  duration: 555_000_000,
                },
              },
            ],
          },
        ],
        draft_file_path:
          "##_subdraft_placeholder_536E1D01-0D97-4295-AA34-0CC47A957B82_##/draft_content.json",
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(
      templateProjectPath,
      "subdraft",
      "EDA282C5-9C0B-4B3D-9728-975D74B59F57",
      "sub_draft_config.json",
    ),
    JSON.stringify(
      {
        id: "EDA282C5-9C0B-4B3D-9728-975D74B59F57",
        name: "복합 클립1",
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(templateProjectPath, "draft_virtual_store.json"),
    JSON.stringify(
      {
        draft_virtual_store: [
          {
            type: 1,
            value: [
              {
                child_id: "cd484075-d92a-4bc9-b45c-d093d2f9e71b",
                parent_id: "",
              },
              {
                child_id: "PHOTO-META-ID",
                parent_id: "",
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(templateProjectPath, "template-2.tmp"),
    JSON.stringify(
      {
        materials: {
          videos: [
            {
              id: "F8DA824C-2629-4789-BEF5-5D80FB7F89F6",
              local_material_id: "e4b864f1-d7b8-4a8a-8986-296b003e17e7",
              material_name: "source-video.mp4",
              path: "/template/source-video.mp4",
            },
            {
              id: "CD415B2C-2C51-4F16-BFCC-5F0FBAF05622",
              material_name: "channel-profile.jpg",
              path: "/template/channel-profile.jpg",
            },
          ],
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(templateProjectPath, "draft_info.json.bak"),
    await readFile(join(templateProjectPath, "draft_info.json"), "utf8"),
    "utf8",
  );
  await writeFile(join(templateProjectPath, "nested.txt"), "fixture", "utf8");

  return {
    rootDir,
    templateProjectPath,
    outputRootPath,
    videoPath,
    profileImagePath,
  };
}

function createRequestBody(
  fixture: Awaited<ReturnType<typeof createGenerationFixture>>,
  overrides?: Partial<ProjectGenerationRequest>,
): ProjectGenerationRequest {
  return {
    planId: "plan-001",
    videoPath: fixture.videoPath,
    originalTitle: "원본 제목",
    profileImagePath: fixture.profileImagePath,
    selections: [
      {
        id: "short-001",
        enabled: true,
        start: "00:01:09.366",
        end: "00:01:36.800",
        topHighlightText: "오늘의 작은 변화",
        topGeneralText: "작은 습관부터 시작해 보세요",
        channelNameText: "예시 채널",
        titleText: "작은 습관으로 하루를 바꾸는 방법 | 예시 채널",
      },
      {
        id: "short-002",
        enabled: true,
        start: "00:02:10.000",
        end: "00:02:22.500",
        topHighlightText: "바로 걸린다",
        topGeneralText: "말해줘야 하나",
        channelNameText: "예시 채널",
        titleText: "말해줘야 할까 | 예시 채널",
      },
    ],
    ...overrides,
  };
}

function expectedProjectName(
  originalTitle: string,
  topHighlightText: string,
  index: number,
): string {
  return `${originalTitle}-${topHighlightText}-${String(index + 1).padStart(2, "0")}`;
}

function expectedProjectMediaPath(
  projectPath: string,
  kind: "source" | "profile",
  sourcePath: string,
): string {
  return join(
    projectPath,
    "Resources",
    "capcut-automation-media",
    `${kind}-${basename(sourcePath)}`,
  );
}

function createFsCpExistsError(message: string): Error {
  return Object.assign(new Error(message), {
    code: "ERR_FS_CP_EEXIST",
  }) as Error;
}

async function readManifest(runId: string) {
  const manifestPath = join(runsDirectory, `${runId}.json`);

  const manifestContent = await readFile(manifestPath, "utf8");
  return JSON.parse(manifestContent) as {
    runId: string;
    request: ProjectGenerationRequest;
    projects: Array<{ selectionId: string; projectPath: string }>;
    failures: Array<{ selectionId: string; reason: string }>;
  };
}

describe("POST /api/projects/generate", () => {
  it("returns 400 when no enabled selections are provided", async () => {
    const fixture = await createGenerationFixture();
    builtInTemplatePathState.value = fixture.templateProjectPath;
    capCutProjectsRootPathState.value = fixture.outputRootPath;

    try {
      const response = await POST(
        new Request("http://localhost/api/projects/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            createRequestBody(fixture, {
              selections: [
                {
                  id: "short-001",
                  enabled: false,
                  start: "00:01:09.366",
                  end: "00:01:36.800",
                  topHighlightText: "오늘의 작은 변화",
                  topGeneralText: "작은 습관부터 시작해 보세요",
                  channelNameText: "예시 채널",
                  titleText: "작은 습관으로 하루를 바꾸는 방법 | 예시 채널",
                },
              ],
            }),
          ),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "INVALID_INPUT",
          message: "At least one enabled selection is required",
        },
      });
    } finally {
      await rm(fixture.rootDir, { recursive: true, force: true });
    }
  });

  it("returns one generated project per enabled selection and writes a manifest", async () => {
    const fixture = await createGenerationFixture();
    builtInTemplatePathState.value = fixture.templateProjectPath;
    capCutProjectsRootPathState.value = fixture.outputRootPath;

    try {
      const requestBody = createRequestBody(fixture);
      const response = await POST(
        new Request("http://localhost/api/projects/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }),
      );

      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        runId: expect.any(String),
        projects: [
          {
            selectionId: "short-001",
            projectPath: join(
              fixture.outputRootPath,
              expectedProjectName("원본 제목", "오늘의 작은 변화", 0),
            ),
          },
          {
            selectionId: "short-002",
            projectPath: join(
              fixture.outputRootPath,
              expectedProjectName("원본 제목", "바로 걸린다", 1),
            ),
          },
        ],
        failures: [],
      });
      const clonedDestinations = vi
        .mocked(cloneTemplateProject)
        .mock.calls.map((call) => call[1]);

      expect(clonedDestinations).toHaveLength(2);
      expect(clonedDestinations).not.toContain(body.projects[0].projectPath);
      expect(clonedDestinations).not.toContain(body.projects[1].projectPath);
      expect(clonedDestinations.every((destination) =>
        destination.startsWith(fixture.outputRootPath),
      )).toBe(false);

      const firstDraftInfo = JSON.parse(
        await readFile(join(body.projects[0].projectPath, "draft_info.json"), "utf8"),
      ) as {
        name: string;
        create_time: number;
        update_time: number;
        materials: {
          videos: Array<{
            id: string;
            path: string;
            material_name?: string;
            category_name?: string;
            is_copyright?: boolean;
            local_material_id?: string;
            duration?: number;
            width?: number;
            height?: number;
            has_audio?: boolean;
          }>;
        };
      };
      const firstDraftMetaInfo = JSON.parse(
        await readFile(
          join(body.projects[0].projectPath, "draft_meta_info.json"),
          "utf8",
        ),
      ) as {
        draft_id: string;
        draft_name: string;
        draft_fold_path: string;
        draft_root_path: string;
        tm_duration: number;
        draft_timeline_materials_size_: number;
        tm_draft_create: number;
        tm_draft_modified: number;
        draft_materials: Array<{
          type: number;
          value: Array<{
            id?: string;
            metetype: string;
            file_Path?: string;
            extra_info?: string;
            duration?: number;
            width?: number;
            height?: number;
            roughcut_time_range?: {
              duration?: number;
            };
            create_time: number;
            import_time: number;
            import_time_ms: number;
          }>;
        }>;
      };
      const firstDraftAgencyConfig = JSON.parse(
        await readFile(
          join(body.projects[0].projectPath, "draft_agency_config.json"),
          "utf8",
        ),
      ) as {
        marterials: Array<{ source_path: string }>;
      };
      const mainVideoMaterial = firstDraftInfo.materials.videos.find(
        (item) => item.id === "F8DA824C-2629-4789-BEF5-5D80FB7F89F6",
      );
      const profileImageMaterial = firstDraftInfo.materials.videos.find(
        (item) => item.id === "CD415B2C-2C51-4F16-BFCC-5F0FBAF05622",
      );
      const metaMediaMaterials =
        firstDraftMetaInfo.draft_materials.find((item) => item.type === 0)?.value ?? [];
      const metaVideoMaterial = metaMediaMaterials.find(
        (item) => item.metetype === "video",
      );
      const metaPhotoMaterial = metaMediaMaterials.find(
        (item) => item.metetype === "photo",
      );
      const metaPlaceholderMaterial = metaMediaMaterials.find(
        (item) => item.metetype === "none",
      );
      const firstDraftVirtualStore = JSON.parse(
        await readFile(
          join(body.projects[0].projectPath, "draft_virtual_store.json"),
          "utf8",
        ),
      ) as {
        draft_virtual_store: Array<{
          type: number;
          value: Array<{ child_id: string }>;
        }>;
      };
      const firstTemplateTmp = await readFile(
        join(body.projects[0].projectPath, "template-2.tmp"),
        "utf8",
      );
      const combinationMaterials =
        firstDraftMetaInfo.draft_materials.find((item) => item.type === 18)?.value ?? [];

      const projectMediaUuidGroup =
        firstDraftVirtualStore.draft_virtual_store.find((item) => item.type === 1)
          ?.value ?? [];
      const clipDuration = 27_434_000;
      const expectedVideoPath = fixture.videoPath;
      const expectedProfileImagePath = expectedProjectMediaPath(
        body.projects[0].projectPath,
        "profile",
        fixture.profileImagePath,
      );

      expect(firstDraftInfo.name).toBe(
        expectedProjectName("원본 제목", "오늘의 작은 변화", 0),
      );
      expect(firstDraftInfo.create_time).toBeGreaterThan(0);
      expect(firstDraftInfo.update_time).toBeGreaterThan(0);
      expect(mainVideoMaterial?.path).toBe(expectedVideoPath);
      expect(mainVideoMaterial?.material_name).toBe("");
      expect(mainVideoMaterial?.local_material_id).toBe("");
      expect(mainVideoMaterial?.category_name).toBe("");
      expect(mainVideoMaterial?.is_copyright).toBe(true);
      expect(mainVideoMaterial?.duration).toBe(1_002_900_000);
      expect(mainVideoMaterial?.width).toBe(1920);
      expect(mainVideoMaterial?.height).toBe(1080);
      expect(mainVideoMaterial?.has_audio).toBe(true);
      expect(profileImageMaterial?.path).toBe(expectedProfileImagePath);
      expect(profileImageMaterial?.material_name).toBe("profile-channel-profile.png");
      expect(profileImageMaterial?.local_material_id).toBe("");
      expect(profileImageMaterial?.category_name).toBe("local");
      expect(profileImageMaterial?.is_copyright).toBe(false);
      expect(profileImageMaterial?.width).toBe(176);
      expect(profileImageMaterial?.height).toBe(176);
      expect(firstDraftMetaInfo.draft_name).toBe(
        expectedProjectName("원본 제목", "오늘의 작은 변화", 0),
      );
      expect(firstDraftMetaInfo.draft_fold_path).toBe(body.projects[0].projectPath);
      expect(firstDraftMetaInfo.draft_root_path).toBe(fixture.outputRootPath);
      expect(firstDraftMetaInfo.draft_id).not.toBe("TEMPLATE-DRAFT-ID");
      expect(firstDraftMetaInfo.draft_id).toMatch(
        /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/,
      );
      expect(firstDraftMetaInfo.tm_duration).toBe(clipDuration);
      expect(firstDraftMetaInfo.draft_timeline_materials_size_).toBe(20);
      expect(firstDraftMetaInfo.tm_draft_create).toBeGreaterThan(0);
      expect(firstDraftMetaInfo.tm_draft_modified).toBeGreaterThan(0);
      expect(metaMediaMaterials).toHaveLength(3);
      expect(metaVideoMaterial).toMatchObject({
        id: "F8DA824C-2629-4789-BEF5-5D80FB7F89F6",
        metetype: "video",
        file_Path: expectedVideoPath,
        extra_info: "video.mp4",
        duration: 1_002_900_000,
        width: 1920,
        height: 1080,
        roughcut_time_range: expect.objectContaining({
          duration: 1_002_900_000,
        }),
      });
      expect(metaVideoMaterial?.create_time).toBe(-1);
      expect(metaVideoMaterial?.import_time).toBe(-1);
      expect(metaVideoMaterial?.import_time_ms).toBe(-1);
      expect(metaPhotoMaterial).toMatchObject({
        id: "PHOTO-META-ID",
        metetype: "photo",
        file_Path: expectedProfileImagePath,
        extra_info: "profile-channel-profile.png",
      });
      expect(metaPhotoMaterial?.create_time).toBeGreaterThan(0);
      expect(metaPhotoMaterial?.import_time).toBeGreaterThan(0);
      expect(metaPhotoMaterial?.import_time_ms).toBeGreaterThan(0);
      expect(metaPlaceholderMaterial).toMatchObject({
        id: "cd484075-d92a-4bc9-b45c-d093d2f9e71b",
        metetype: "none",
        file_Path: "",
        extra_info: "",
        width: 0,
        height: 0,
        duration: 33_333,
      });
      expect(metaPlaceholderMaterial?.create_time).toBeGreaterThan(0);
      expect(metaPlaceholderMaterial?.import_time).toBeGreaterThan(0);
      expect(metaPlaceholderMaterial?.import_time_ms).toBeGreaterThan(0);
      expect(projectMediaUuidGroup).toEqual([
        {
          child_id: "cd484075-d92a-4bc9-b45c-d093d2f9e71b",
          parent_id: "",
        },
        {
          child_id: "PHOTO-META-ID",
          parent_id: "",
        },
        {
          child_id: "F8DA824C-2629-4789-BEF5-5D80FB7F89F6",
          parent_id: "",
        },
      ]);
      expect(firstTemplateTmp).not.toContain("e4b864f1-d7b8-4a8a-8986-296b003e17e7");
      expect(firstTemplateTmp).not.toContain("PHOTO-META-ID");
      expect(firstTemplateTmp).not.toContain("\"material_name\": \"video.mp4\"");
      expect(firstTemplateTmp).toContain(`\"path\": \"${expectedVideoPath}\"`);
      expect(combinationMaterials).toHaveLength(1);
      expect(combinationMaterials[0]).toMatchObject({
        metetype: "combination",
        file_Path: "./subdraft/EDA282C5-9C0B-4B3D-9728-975D74B59F57/sub_draft_config.json",
      });
      expect(firstDraftAgencyConfig.marterials[0]?.source_path).toBe(
        expectedProfileImagePath,
      );
      await expect(
        readFile(
          expectedProjectMediaPath(
            body.projects[0].projectPath,
            "source",
            fixture.videoPath,
          ),
          "utf8",
        ),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(expectedProfileImagePath, "utf8")).resolves.toBe(
        "fake image",
      );
      await expect(
        readFile(join(body.projects[0].projectPath, "nested.txt"), "utf8"),
      ).resolves.toBe("fixture");
      await expect(
        readdir(join(body.projects[0].projectPath, "subdraft")),
      ).resolves.toContain("EDA282C5-9C0B-4B3D-9728-975D74B59F57");
      const generatedSubdraftContent = JSON.parse(
        await readFile(
          join(
            body.projects[0].projectPath,
            "subdraft",
            "EDA282C5-9C0B-4B3D-9728-975D74B59F57",
            "draft_content.json",
          ),
          "utf8",
        ),
      ) as {
        materials: {
          videos: Array<Record<string, unknown>>;
        };
        draft_materials: Array<{
          type: number;
          value: Array<Record<string, unknown>>;
        }>;
      };
      expect(generatedSubdraftContent.materials.videos).toContainEqual(
        expect.objectContaining({
          path: expectedVideoPath,
          duration: 1_002_900_000,
          material_name: "video.mp4",
          local_material_id: "e4b864f1-d7b8-4a8a-8986-296b003e17e7",
          category_name: "local",
          is_copyright: false,
          width: 1920,
          height: 1080,
          has_audio: true,
        }),
      );
      expect(generatedSubdraftContent.materials.videos).toContainEqual(
        expect.objectContaining({
          path: expectedProfileImagePath,
          duration: 10_800_000_000,
          material_name: "profile-channel-profile.png",
          local_material_id: "",
          category_name: "local",
          is_copyright: false,
          width: 176,
          height: 176,
          has_audio: false,
        }),
      );
      const generatedSubdraftMetaMaterials =
        generatedSubdraftContent.draft_materials.find((item) => item.type === 0)?.value ?? [];
      expect(generatedSubdraftMetaMaterials).toContainEqual(
        expect.objectContaining({
          metetype: "video",
          file_Path: expectedVideoPath,
          extra_info: "video.mp4",
          duration: 1_002_900_000,
          width: 1920,
          height: 1080,
          roughcut_time_range: expect.objectContaining({
            duration: 1_002_900_000,
          }),
        }),
      );
      expect(generatedSubdraftMetaMaterials).toContainEqual(
        expect.objectContaining({
          metetype: "photo",
          file_Path: expectedProfileImagePath,
          extra_info: "profile-channel-profile.png",
          duration: 10_800_000_000,
          width: 176,
          height: 176,
        }),
      );

      const manifest = await readManifest(body.runId);

      expect(manifest).toMatchObject({
        runId: body.runId,
        request: requestBody,
        projects: body.projects,
        failures: [],
      });
    } finally {
      await rm(fixture.rootDir, { recursive: true, force: true });
    }
  });

  it("returns 400 when a disabled selection carries a wrong-typed stale field", async () => {
    const fixture = await createGenerationFixture();
    builtInTemplatePathState.value = fixture.templateProjectPath;
    capCutProjectsRootPathState.value = fixture.outputRootPath;

    try {
      const requestBody = createRequestBody(fixture, {
        selections: [
          {
            id: "short-001",
            enabled: false,
            start: 123 as unknown as string,
          },
          {
            id: "short-002",
            enabled: true,
            start: "00:02:10.000",
            end: "00:02:22.500",
            topHighlightText: "바로 걸린다",
            topGeneralText: "말해줘야 하나",
            channelNameText: "예시 채널",
            titleText: "말해줘야 할까 | 예시 채널",
          },
        ],
      });

      const response = await POST(
        new Request("http://localhost/api/projects/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }),
      );

      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        error: {
          code: "INVALID_INPUT",
          message: "Invalid input",
        },
      });
      await expect(readdir(fixture.outputRootPath)).resolves.toEqual([]);
    } finally {
      await rm(fixture.rootDir, { recursive: true, force: true });
    }
  });

  it("accepts disabled selections that omit generation fields and preserves them in the manifest", async () => {
    const fixture = await createGenerationFixture();
    builtInTemplatePathState.value = fixture.templateProjectPath;
    capCutProjectsRootPathState.value = fixture.outputRootPath;

    try {
      const requestBody = createRequestBody(fixture, {
        selections: [
          {
            id: "short-001",
            enabled: false,
          },
          {
            id: "short-002",
            enabled: true,
            start: "00:02:10.000",
            end: "00:02:22.500",
            topHighlightText: "바로 걸린다",
            topGeneralText: "말해줘야 하나",
            channelNameText: "예시 채널",
            titleText: "말해줘야 할까 | 예시 채널",
          },
        ],
      });

      const response = await POST(
        new Request("http://localhost/api/projects/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }),
      );

      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.projects).toEqual([
        {
          selectionId: "short-002",
          projectPath: join(
            fixture.outputRootPath,
            expectedProjectName("원본 제목", "바로 걸린다", 0),
          ),
        },
      ]);

      const manifest = await readManifest(body.runId);
      expect(manifest.request.selections[0]).toEqual({
        id: "short-001",
        enabled: false,
      });
      expect(manifest.request.selections[1]).toMatchObject({
        id: "short-002",
        enabled: true,
        start: "00:02:10.000",
        end: "00:02:22.500",
      });
    } finally {
      await rm(fixture.rootDir, { recursive: true, force: true });
    }
  });

  it("returns 400 when selection ids are duplicated", async () => {
    const fixture = await createGenerationFixture();
    builtInTemplatePathState.value = fixture.templateProjectPath;
    capCutProjectsRootPathState.value = fixture.outputRootPath;

    try {
      const response = await POST(
        new Request("http://localhost/api/projects/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            createRequestBody(fixture, {
              selections: [
                {
                  id: "short-001",
                  enabled: true,
                  start: "00:01:09.366",
                  end: "00:01:36.800",
                  topHighlightText: "오늘의 작은 변화",
                  topGeneralText: "작은 습관부터 시작해 보세요",
                  channelNameText: "예시 채널",
                  titleText: "작은 습관으로 하루를 바꾸는 방법 | 예시 채널",
                },
                {
                  id: "short-001",
                  enabled: true,
                  start: "00:02:10.000",
                  end: "00:02:22.500",
                  topHighlightText: "바로 걸린다",
                  topGeneralText: "말해줘야 하나",
                  channelNameText: "예시 채널",
                  titleText: "말해줘야 할까 | 예시 채널",
                },
              ],
            }),
          ),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "INVALID_INPUT",
          message: "Selection IDs must be unique",
        },
      });
      await expect(readdir(fixture.outputRootPath)).resolves.toEqual([]);
    } finally {
      await rm(fixture.rootDir, { recursive: true, force: true });
    }
  });

  it("allocates a deterministic numeric suffix when the base project path already exists", async () => {
    const fixture = await createGenerationFixture();
    builtInTemplatePathState.value = fixture.templateProjectPath;
    capCutProjectsRootPathState.value = fixture.outputRootPath;

    try {
      const baseProjectPath = join(
        fixture.outputRootPath,
        expectedProjectName("원본 제목", "오늘의 작은 변화", 0),
      );
      const firstSuffixPath = `${baseProjectPath}-1`;

      await mkdir(baseProjectPath, { recursive: true });
      await mkdir(firstSuffixPath, { recursive: true });

      const response = await POST(
        new Request("http://localhost/api/projects/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(createRequestBody(fixture)),
        }),
      );

      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.projects[0]).toEqual({
        selectionId: "short-001",
        projectPath: `${baseProjectPath}-2`,
      });
      await expect(
        readFile(join(`${baseProjectPath}-2`, "draft_info.json"), "utf8"),
      ).resolves.toContain(
        `"name": "${expectedProjectName("원본 제목", "오늘의 작은 변화", 0)}-2"`,
      );
    } finally {
      await rm(fixture.rootDir, { recursive: true, force: true });
    }
  });

  it("retries the next numeric suffix when clone loses a filesystem race", async () => {
    const fixture = await createGenerationFixture();
    builtInTemplatePathState.value = fixture.templateProjectPath;
    capCutProjectsRootPathState.value = fixture.outputRootPath;

    try {
      cloneFailureState.error = createFsCpExistsError(
        "Target already exists: cp returned EEXIST (/tmp/generated-projects/project already exists)",
      );

      const requestBody = createRequestBody(fixture);
      const response = await POST(
        new Request("http://localhost/api/projects/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }),
      );

      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.projects[0]).toEqual({
        selectionId: "short-001",
        projectPath: join(
          fixture.outputRootPath,
          expectedProjectName("원본 제목", "오늘의 작은 변화", 0) + "-1",
        ),
      });
      await expect(
        readFile(join(body.projects[0].projectPath, "draft_info.json"), "utf8"),
      ).resolves.toContain(
        `"name": "${expectedProjectName("원본 제목", "오늘의 작은 변화", 0)}-1"`,
      );
    } finally {
      await rm(fixture.rootDir, { recursive: true, force: true });
    }
  });

  it("returns 400 before generation starts when any enabled selection has an invalid range", async () => {
    const fixture = await createGenerationFixture();
    builtInTemplatePathState.value = fixture.templateProjectPath;
    capCutProjectsRootPathState.value = fixture.outputRootPath;

    try {
      const response = await POST(
        new Request("http://localhost/api/projects/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            createRequestBody(fixture, {
              selections: [
                {
                  id: "short-001",
                  enabled: true,
                  start: "00:01:09.366",
                  end: "00:01:09.366",
                  topHighlightText: "오늘의 작은 변화",
                  topGeneralText: "작은 습관부터 시작해 보세요",
                  channelNameText: "예시 채널",
                  titleText: "작은 습관으로 하루를 바꾸는 방법 | 예시 채널",
                },
                {
                  id: "short-002",
                  enabled: true,
                  start: "00:02:10.000",
                  end: "00:02:22.500",
                  topHighlightText: "바로 걸린다",
                  topGeneralText: "말해줘야 하나",
                  channelNameText: "예시 채널",
                  titleText: "말해줘야 할까 | 예시 채널",
                },
              ],
            }),
          ),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "INVALID_INPUT",
          message: "Selection short-001 must satisfy start < end",
        },
      });
      await expect(readdir(fixture.outputRootPath)).resolves.toEqual([]);
    } finally {
      await rm(fixture.rootDir, { recursive: true, force: true });
    }
  });

  it("returns generated projects even when manifest writing fails", async () => {
    const fixture = await createGenerationFixture();
    builtInTemplatePathState.value = fixture.templateProjectPath;
    capCutProjectsRootPathState.value = fixture.outputRootPath;

    manifestFailureState.message = "Manifest disk write failed";

    try {
      const response = await POST(
        new Request("http://localhost/api/projects/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(createRequestBody(fixture)),
        }),
      );

      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.projects).toEqual([
        {
          selectionId: "short-001",
          projectPath: join(
            fixture.outputRootPath,
            expectedProjectName("원본 제목", "오늘의 작은 변화", 0),
          ),
        },
        {
          selectionId: "short-002",
          projectPath: join(
            fixture.outputRootPath,
            expectedProjectName("원본 제목", "바로 걸린다", 1),
          ),
        },
      ]);
      expect(body.failures).toEqual([]);
      expect(body.warnings).toEqual([
        "Failed to write run manifest: Manifest disk write failed",
      ]);

      await expect(
        readFile(
          join(
            fixture.outputRootPath,
            expectedProjectName("원본 제목", "바로 걸린다", 1),
            "draft_info.json",
          ),
          "utf8",
        ),
      ).resolves.toContain("\"name\"");
    } finally {
      await rm(fixture.rootDir, { recursive: true, force: true });
    }
  });
});
