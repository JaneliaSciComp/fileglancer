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

type Success<T> = {
  success: true;
  data: T;
};

interface Failure {
  success: false;
  error: string;
}

type Result<T> = Success<T> | Failure;

export type {
  FileOrFolder,
  FileSharePath,
  Zone,
  ZonesAndFileSharePathsMap,
  Result,
  Success,
  Failure
};
