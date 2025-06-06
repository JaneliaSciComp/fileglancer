import * as React from 'react';
import { useCookies } from 'react-cookie';

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
  group: string;
  storage: string;
  linux_path: string;
  canonical_path: string;
  mac_path: string | null;
  windows_path: string | null;
};

export type FileSharePaths = Record<string, string[]>;

export default function useFileBrowser() {
  const [checked, setChecked] = React.useState<string[]>([]);
  const [files, setFiles] = React.useState<File[]>([]);
  const [currentPath, setCurrentPath] = React.useState<File['path']>('');
  const [fileSharePaths, setFileSharePaths] = React.useState<FileSharePaths>(
    {}
  );
  const [openZones, setOpenZones] = React.useState<Record<string, boolean>>({});
  const [selectedZone, setSelectedZone] = React.useState<string | null>(null);
  const [cookies] = useCookies(['_xsrf']);

  function handleCheckboxToggle(item: File) {
    const currentIndex = checked.indexOf(item.name);
    const newChecked = [...checked];

    if (currentIndex === -1) {
      newChecked.push(item.name);
    } else {
      newChecked.splice(currentIndex, 1);
    }

    setChecked(newChecked);
  }

  function toggleZone(zone: string) {
    setOpenZones(prev => ({
      ...prev,
      [zone]: !prev[zone]
    }));
  }

  // Handler for when a path is clicked in the sidebar
  const handlePathClick = (path: string) => {
    setSelectedZone(path);
    getFiles(path);
  };

  async function getFiles(path: File['path']): Promise<void> {
    let cleanPath = path;

    if (path && path.trim() !== '') {
      // Remove leading slash from path if present to avoid double slashes
      cleanPath = path.trim().startsWith('/')
        ? path.trim().substring(1)
        : path.trim();
    }

    const url = `/api/fileglancer/files/${cleanPath}`;

    let data = [];
    try {
      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'X-Xsrftoken': cookies['_xsrf']
        }
      });

      if (!response.ok) {
        throw new Error(`Response status: ${response.status}`);
      }

      data = await response.json();
      if (data) {
        setCurrentPath(path);
      }
      if (data.files) {
        // display directories first, then files
        // within a type (directories or files), display alphabetically
        data.files = data.files.sort((a: File, b: File) => {
          if (a.is_dir === b.is_dir) {
            return a.name.localeCompare(b.name);
          }
          return a.is_dir ? -1 : 1;
        });
        setFiles(data.files as File[]);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error('An unknown error occurred');
      }
    }
  }

  async function getFileSharePaths() {
    const url = '/api/fileglancer/file-share-paths';

    try {
      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'X-Xsrftoken': cookies['_xsrf']
        }
      });
      if (!response.ok) {
        throw new Error(`Response status: ${response.status}`);
      }

      const rawData: Record<string, FileSharePathItem[]> =
        await response.json();

      const unsortedPaths: FileSharePaths = {};

      rawData.paths.forEach(item => {
        if (!unsortedPaths[item.zone]) {
          unsortedPaths[item.zone] = [];
        }

        if (!unsortedPaths[item.zone].includes(item.canonical_path)) {
          unsortedPaths[item.zone].push(item.canonical_path);
        }
      });

      // Sort the linux_paths for each zone alphabetically
      Object.keys(unsortedPaths).forEach(zone => {
        unsortedPaths[zone].sort();
      });

      // Create a new object with alphabetically sorted zone keys
      const sortedPaths: FileSharePaths = {};
      Object.keys(unsortedPaths)
        .sort()
        .forEach(zone => {
          sortedPaths[zone] = unsortedPaths[zone];
        });

      setFileSharePaths(sortedPaths);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error('An unknown error occurred');
      }
    }
  }

  return {
    checked,
    files,
    currentPath,
    fileSharePaths,
    openZones,
    selectedZone,
    setSelectedZone,
    handleCheckboxToggle,
    getFiles,
    getFileSharePaths,
    toggleZone,
    handlePathClick
  };
}
