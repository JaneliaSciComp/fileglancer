export type File = {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  permissions: string;
  owner: string;
  group: string;
  last_modified: number;
};

export type FileSharePathItem = {
  zone: string;
  name: string;
  group: string;
  storage: string;
  mount_path: string;
  linux_path: string;
  mac_path: string | null;
  windows_path: string | null;
};

export type FileSharePaths = Record<string, FileSharePathItem[]>;

export type Cookies = { [key: string]: string };
