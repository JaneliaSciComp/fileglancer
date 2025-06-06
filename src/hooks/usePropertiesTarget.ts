import React from 'react';
import type { FileOrFolder } from '../shared.types';
import { useFileBrowserContext } from '../contexts/FileBrowserContext';

export default function usePropertiesTarget() {
  const [propertiesTarget, setPropertiesTarget] =
    React.useState<FileOrFolder | null>(null);
  const { files, currentFileSharePath } = useFileBrowserContext();

  React.useEffect(() => {
    if (propertiesTarget) {
      setPropertiesTarget(null);
    }
  }, [currentFileSharePath]);

  React.useEffect(() => {
    if (propertiesTarget) {
      const targetFile = files.find(
        file => file.name === propertiesTarget.name
      );
      if (targetFile) {
        setPropertiesTarget(targetFile);
      } else if (!targetFile) {
        setPropertiesTarget(null);
      }
    }
  }, [files]);

  return {
    propertiesTarget,
    setPropertiesTarget
  };
}
