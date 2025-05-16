import * as React from 'react';
import { File } from '../hooks/useFileBrowser';

export default function useDisplayOptions(files: File[]) {
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [hideDotFiles, setHideDotFiles] = React.useState<boolean>(true);
  const [showFileDrawer, setShowFileDrawer] = React.useState<boolean>(false);
  const [showFileContextMenu, setShowFileContextMenu] =
    React.useState<boolean>(false);
  const [contextMenuCoords, setContextMenuCoords] = React.useState({
    x: 0,
    y: 0
  });

  const displayFiles = React.useMemo(() => {
    return hideDotFiles
      ? files.filter(file => !file.name.startsWith('.'))
      : files;
  }, [files, hideDotFiles]);

  const handleFileClick = (e: React.MouseEvent<HTMLDivElement>, file: File) => {
    e.preventDefault();
    setSelectedFile(prev => (prev === file ? null : file));
    if (e.type === 'contextmenu') {
      setContextMenuCoords({ x: e.clientX, y: e.clientY });
      setShowFileContextMenu(true);
      e.stopPropagation();
    }
  };

  return {
    selectedFile,
    displayFiles,
    hideDotFiles,
    setHideDotFiles,
    showFileDrawer,
    setShowFileDrawer,
    showFileContextMenu,
    setShowFileContextMenu,
    contextMenuCoords,
    handleFileClick
  };
}
