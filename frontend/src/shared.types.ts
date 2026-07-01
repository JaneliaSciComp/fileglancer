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
  is_symlink?: boolean;
  symlink_target_fsp?: {
    fsp_name: string;
    subpath: string;
  } | null;
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
  headers?: Record<string, string>;
};

// --- App / Job types ---

type AppParameter = {
  flag?: string;
  key: string;
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
  hidden?: boolean;
  raw?: boolean;
};

type AppParameterSection = {
  section: string;
  description?: string;
  collapsed?: boolean;
  parameters: AppParameter[];
};

type AppParameterItem = AppParameter | AppParameterSection;

function isParameterSection(
  item: AppParameterItem
): item is AppParameterSection {
  return 'section' in item;
}

function flattenParameters(items: AppParameterItem[]): AppParameter[] {
  return items.flatMap(item =>
    isParameterSection(item) ? item.parameters : [item]
  );
}

type AppResourceDefaults = {
  cpus?: number;
  memory?: string;
  walltime?: string;
  queue?: string;
};

type AppEntryPoint = {
  id: string;
  name: string;
  type?: 'job' | 'service';
  description?: string;
  command: string;
  parameters: AppParameterItem[];
  env_parameters?: AppParameterItem[];
  resources?: AppResourceDefaults;
  env?: Record<string, string>;
  pre_run?: string;
  post_run?: string;
  conda_env?: string;
  container?: string;
  bind_paths?: string[];
  container_args?: string;
  working_dir?: 'work' | 'repo';
  auto_url?: boolean;
  requirements?: string[];
};

type AppManifest = {
  name: string;
  description?: string;
  repo_url?: string;
  requirements?: string[];
  runnables: AppEntryPoint[];
};

type UserApp = {
  url: string;
  manifest_path: string;
  branch?: string;
  name: string;
  description?: string;
  added_at: string;
  updated_at?: string;
  manifest?: AppManifest;
  listing_id?: number;
};

type AppListing = {
  id: number;
  owner_username: string;
  url: string;
  manifest_path: string;
  branch?: string;
  name: string;
  description?: string;
  published_at: string;
  updated_at?: string;
};

type JobFileInfo = {
  path: string;
  exists: boolean;
  fsp_name?: string;
  subpath?: string;
};

type Job = {
  id: number;
  app_url: string;
  app_name: string;
  manifest_path: string;
  entry_point_id: string;
  entry_point_name: string;
  entry_point_type?: 'job' | 'service';
  parameters: Record<string, unknown>;
  env_parameters?: Record<string, unknown>;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'KILLED';
  exit_code?: number;
  resources?: Record<string, unknown>;
  env?: Record<string, string>;
  pre_run?: string;
  post_run?: string;
  container?: string;
  container_args?: string;
  command?: string;
  conda_env?: string;
  requirements?: string[];
  work_dir?: string;
  cluster_job_id?: string;
  service_url?: string;
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
  env_parameters?: Record<string, unknown>;
  resources?: AppResourceDefaults;
  extra_args?: string;
  env?: Record<string, string>;
  pre_run?: string;
  post_run?: string;
  container?: string;
  container_args?: string;
};

/**
 * Serializable snapshot of an app-launch form, covering all three tabs
 * (Parameters, Environment, Cluster). Mirrors the user-supplied fields of
 * JobSubmitRequest minus the identity fields (app_url, manifest_path,
 * entry_point_id). All fields are optional so a file may populate any subset.
 */
type AppLaunchParamsFile = {
  parameters?: Record<string, unknown>;
  env_parameters?: Record<string, unknown>;
  resources?: AppResourceDefaults;
  extra_args?: string;
  env?: Record<string, string>;
  pre_run?: string;
  post_run?: string;
  container?: string;
  container_args?: string;
};

/**
 * Parse and validate the text of an uploaded app-launch params file. Throws a
 * descriptive Error if the text is not valid JSON or is not a plain object.
 */
function parseAppLaunchParamsFile(text: string): AppLaunchParamsFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object of parameters');
  }
  return parsed as AppLaunchParamsFile;
}

export type {
  AppEntryPoint,
  AppLaunchParamsFile,
  AppListing,
  AppManifest,
  AppParameter,
  AppParameterItem,
  AppParameterSection,
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

export { flattenParameters, isParameterSection, parseAppLaunchParamsFile };
