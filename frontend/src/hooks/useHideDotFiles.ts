import React from 'react';
import { useFileBrowserContext } from '../contexts/FileBrowserContext';
import { usePreferencesContext } from '../contexts/PreferencesContext';
import { FileOrFolder } from '@/shared.types';

export default function useHideDotFiles() {
  const { hideDotFiles } = usePreferencesContext();
  const { fileQuery } = useFileBrowserContext();

  const displayFiles = React.useMemo(() => {
    if (!fileQuery.data?.files) {
      return [];
    }
    return hideDotFiles
      ? fileQuery.data.files.filter(
          (file: FileOrFolder) => !file.name.startsWith('.')
        )
      : fileQuery.data.files;
  }, [fileQuery, hideDotFiles]);

  return {
    displayFiles
  };
}
