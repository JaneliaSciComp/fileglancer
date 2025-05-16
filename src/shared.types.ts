export type FileOrFolder = {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  permissions: string;
  owner: string;
  group: string;
  last_modified: number;
};

export type FileSharePath = {
  zone: string;
  name: string;
  group: string;
  storage: string;
  mount_path: string;
  linux_path: string;
  mac_path: string | null;
  windows_path: string | null;
};

export type Zone = { name: string; fileSharePaths: FileSharePath[] };

export type ZonesAndFileSharePathsMap = Record<string, FileSharePath | Zone>;

export type Cookies = { [key: string]: string };
