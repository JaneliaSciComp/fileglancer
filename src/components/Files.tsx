import React from 'react';
import FileSidebar from '../components/ui/FileSidebar';
import FileList from '../components/ui/FileList';
import useFileList from '../hooks/useFileBrowser';

export default function Files() {
  const {
    files,
    fileSharePaths,
    currentPath,
    checked,
    openZones,
    getFiles,
    getFileSharePaths,
    handleCheckboxToggle,
    toggleZone
  } = useFileList();

  React.useEffect(() => {
    if (files.length === 0) {
      getFiles('');
    }
  }, [files, getFiles]);

  React.useEffect(() => {
    if (Object.keys(fileSharePaths).length === 0) {
      getFileSharePaths();
    }
  }, [fileSharePaths, getFileSharePaths]);

  // Handler for when a path is clicked in the sidebar
  const handlePathClick = (path: string) => {
    getFiles(path);
  };

  return (
    <div className="flex h-full w-full">
      <div className="w-64 h-full border-r border-gray-200 overflow-y-auto">
        <FileSidebar
          fileSharePaths={fileSharePaths}
          openZones={openZones}
          toggleZone={toggleZone}
          onPathClick={handlePathClick}
        />
      </div>
      <div className="flex-1 h-full overflow-auto">
        <FileList
          files={files}
          currentPath={currentPath}
          checked={checked}
          handleCheckboxToggle={handleCheckboxToggle}
          getFiles={getFiles}
        />
      </div>
    </div>
  );
}
