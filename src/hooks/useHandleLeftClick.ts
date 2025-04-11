import * as React from 'react';
import type { File } from '../shared.types';
import { useFileBrowserContext } from '../contexts/FileBrowserContext';
import useSelectedFiles from './useSelectedFiles';
import usePropertiesTarget from './usePropertiesTarget';
import useFileDrawer from './useShowFilePropertiesDrawer';

// Hook to handle left click events on files in the file browser
export default function useHandleLeftClick() {
  const { files } = useFileBrowserContext();
  const { selectedFiles, setSelectedFiles } = useSelectedFiles();
  const { setPropertiesTarget } = usePropertiesTarget();
  const { showFilePropertiesDrawer } = useFileDrawer();

  const handleLeftClick = (e: React.MouseEvent<HTMLDivElement>, file: File) => {
    if (e.shiftKey) {
      // If shift key held down while clicking,
      // add all files between the last selected and the current file
      const lastSelectedIndex = selectedFiles.length
        ? files.findIndex(f => f === selectedFiles[selectedFiles.length - 1])
        : -1;
      const currentIndex = files.findIndex(f => f.name === file.name);
      const start = Math.min(lastSelectedIndex, currentIndex);
      const end = Math.max(lastSelectedIndex, currentIndex);
      const newSelectedFiles = files.slice(start, end + 1);
      setSelectedFiles(newSelectedFiles);
      setPropertiesTarget(file);
    } else if (e.metaKey) {
      // If  "Windows/Cmd" is held down while clicking,
      // toggle the current file in the selection
      // and set it as the properties target
      const currentIndex = selectedFiles.indexOf(file);
      const newSelectedFiles = [...selectedFiles];

      if (currentIndex === -1) {
        newSelectedFiles.push(file);
      } else {
        newSelectedFiles.splice(currentIndex, 1);
      }

      setSelectedFiles(newSelectedFiles);
      setPropertiesTarget(file);
    } else {
      // If no modifier keys are held down, select the current file
      const currentIndex = selectedFiles.indexOf(file);
      const newSelectedFiles =
        currentIndex === -1 ||
        selectedFiles.length > 1 ||
        showFilePropertiesDrawer
          ? [file]
          : [];
      setSelectedFiles(newSelectedFiles);
      const newPropertiesTarget =
        currentIndex === -1 ||
        selectedFiles.length > 1 ||
        showFilePropertiesDrawer
          ? file
          : null;
      setPropertiesTarget(newPropertiesTarget);
    }
  };

  return {
    handleLeftClick
  };
}
