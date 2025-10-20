import React from 'react';
import { useFileBrowserContext } from '../contexts/FileBrowserContext';
import { usePreferencesContext } from '../contexts/PreferencesContext';

export default function useHideDotFiles() {
  const { hideDotFiles } = usePreferencesContext();
  const { fileBrowserState } = useFileBrowserContext();

  const displayFiles = React.useMemo(() => {
    return hideDotFiles
      ? fileBrowserState.files.filter(file => !file.name.startsWith('.'))
      : fileBrowserState.files;
  }, [fileBrowserState.files, hideDotFiles]);

  return {
    displayFiles
  };
}
