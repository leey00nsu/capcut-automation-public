export type ProjectSelectionFields = {
  start: string;
  end: string;
  topHighlightText: string;
  topGeneralText: string;
  channelNameText: string;
  titleText: string;
};

export type ProjectSelection =
  | ({
      id: string;
      enabled: true;
    } & ProjectSelectionFields)
  | ({
      id: string;
      enabled: false;
    } & Partial<ProjectSelectionFields>);

export type ReviewedSelection = Extract<ProjectSelection, { enabled: true }>;

export type ProjectGenerationRequest = {
  planId: string;
  videoPath: string;
  originalTitle: string;
  profileImagePath?: string;
  selections: ProjectSelection[];
};

export type GeneratedProject = {
  selectionId: string;
  projectPath: string;
};

export type ProjectGenerationFailure = {
  selectionId: string;
  reason: string;
};

export type ProjectGenerationResult = {
  runId: string;
  projects: GeneratedProject[];
  failures: ProjectGenerationFailure[];
  warnings?: string[];
};
