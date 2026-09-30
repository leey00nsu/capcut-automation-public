export type LocalSttStatus =
  | "unsupported"
  | "not_installed"
  | "partial"
  | "installing"
  | "ready"
  | "failed";

export type LocalSttComponentKey =
  | "python"
  | "venv"
  | "mlx_whisper"
  | "ffmpeg"
  | "default_model";

export type LocalSttOperationKind = "install" | "repair" | "uninstall";

export type LocalSttPlatform = {
  os: string;
  arch: string;
  macosVersion?: string;
  reason?: string;
};

export type LocalSttComponentState = {
  key: LocalSttComponentKey;
  title: string;
  version: string;
  purpose: string;
  installed: boolean;
  healthy: boolean;
  downloadBytes: number;
  installBytes: number;
  installPath: string;
  sourceLabel: string;
};

export type LocalSttInstallPlanItem = {
  key: LocalSttComponentKey;
  title: string;
  version: string;
  purpose: string;
  sourceLabel: string;
  downloadBytes: number;
  installBytes: number;
  installPath: string;
};

export type LocalSttInstallPlan = {
  fingerprint: string;
  generatedAt: string;
  installRoot: string;
  modelId: string;
  modelLabel: string;
  requiresNetwork: boolean;
  totalDownloadBytes: number;
  totalInstallBytes: number;
  freeDiskBytes: number;
  items: LocalSttInstallPlanItem[];
};

export type LocalSttCurrentOperation = {
  kind: LocalSttOperationKind;
  startedAt: string;
  stepKey: string;
};

export type LocalSttSetupState = {
  status: LocalSttStatus;
  supported: boolean;
  platform: LocalSttPlatform;
  installRoot: string;
  freeDiskBytes?: number;
  selectedModelId: string;
  selectedModelLabel: string;
  components: LocalSttComponentState[];
  currentOperation?: LocalSttCurrentOperation;
  lastCompletedAt?: string;
  lastError?: string;
};

export type LocalSttStatusResponse = {
  setup: LocalSttSetupState;
  installPlan?: LocalSttInstallPlan;
};
