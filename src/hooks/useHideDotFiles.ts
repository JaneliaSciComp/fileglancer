import React from 'react';
import { useFileBrowserContext } from '../contexts/FileBrowserContext';

export default function useHideDotFiles() {
  const [hideDotFiles, setHideDotFiles] = React.useState<boolean>(true);
  const { files } = useFileBrowserContext();

  const displayFiles = React.useMemo(() => {
    return hideDotFiles
      ? files.filter(file => !file.name.startsWith('.'))
      : files;
  }, [files, hideDotFiles]);

  return {
    displayFiles,
    hideDotFiles,
    setHideDotFiles
  };
}
