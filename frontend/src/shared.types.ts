type FileOrFolder = {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  permissions: string;
  owner: string;
  group: string;
  last_modified: number;
  hasRead?: boolean;
  hasWrite?: boolean;
};

type FileSharePath = {
  zone: string;
  name: string;
  group: string;
  storage: string;
  mount_path: string;
  linux_path: string | null;
  mac_path: string | null;
  windows_path: string | null;
};
// Note: linux_path, mac_path, and windows_path are null when running in local env with no fileglancer_central url set in the jupyter server config

type Zone = { name: string; fileSharePaths: FileSharePath[] };

type ZonesAndFileSharePathsMap = Record<string, FileSharePath | Zone>;

type Profile = {
  username: string;
  homeFileSharePathName: string;
  homeDirectoryName: string;
  groups: string[];
};

type Success<T> = {
  success: true;
  data: T;
};

interface Failure {
  success: false;
  error: string;
}

type Result<T> = Success<T> | Failure;

type FetchRequestOptions = {
  signal?: AbortSignal;
};

// --- App / Job types ---

type AppParameter = {
  id: string;
  name: string;
  type:
    | 'string'
    | 'integer'
    | 'number'
    | 'boolean'
    | 'file'
    | 'directory'
    | 'enum';
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: string[];
  min?: number;
  max?: number;
  pattern?: string;
};

type AppResourceDefaults = {
  cpus?: number;
  memory?: string;
  walltime?: string;
};

type AppEntryPoint = {
  id: string;
  name: string;
  description?: string;
  command: string;
  parameters: AppParameter[];
  resources?: AppResourceDefaults;
};

type AppManifest = {
  name: string;
  description?: string;
  version?: string;
  repo_url?: string;
  requirements?: string[];
  runnables: AppEntryPoint[];
};

type UserApp = {
  url: string;
  manifest_path: string;
  name: string;
  description?: string;
  added_at: string;
  manifest?: AppManifest;
};

type JobFileInfo = {
  path: string;
  exists: boolean;
};

type Job = {
  id: number;
  app_url: string;
  app_name: string;
  manifest_path: string;
  entry_point_id: string;
  entry_point_name: string;
  parameters: Record<string, unknown>;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'KILLED';
  exit_code?: number;
  resources?: Record<string, unknown>;
  cluster_job_id?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  files?: Record<string, JobFileInfo>;
};

type JobSubmitRequest = {
  app_url: string;
  manifest_path?: string;
  entry_point_id: string;
  parameters: Record<string, unknown>;
  resources?: AppResourceDefaults;
  pull_latest?: boolean;
};

export type {
  AppEntryPoint,
  AppManifest,
  AppParameter,
  AppResourceDefaults,
  FetchRequestOptions,
  FileOrFolder,
  FileSharePath,
  Failure,
  Job,
  JobFileInfo,
  JobSubmitRequest,
  Profile,
  Result,
  Success,
  UserApp,
  Zone,
  ZonesAndFileSharePathsMap
};
