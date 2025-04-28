import React from 'react';

import useContextMenu from '../hooks/useContextMenu';
import useFileDrawer from '../hooks/useShowFilePropertiesDrawer';
import usePropertiesTarget from '../hooks/usePropertiesTarget';
import useHideDotFiles from '../hooks/useHideDotFiles';
import useSelectedFiles from '../hooks/useSelectedFiles';

import FileList from './ui/FileList';
import PropertiesDrawer from './ui/PropertiesDrawer/PropertiesDrawer';
import FileControlPanel from './ui/FileControlPanel';
import FileContextMenu from './ui/FileContextMenu';

export default function Files() {
  const {
    contextMenuCoords,
    showFileContextMenu,
    setShowFileContextMenu,
    menuRef,
    handleRightClick
  } = useContextMenu();
  const { showFilePropertiesDrawer, setShowFilePropertiesDrawer } =
    useFileDrawer();
  const { propertiesTarget, setPropertiesTarget } = usePropertiesTarget();
  const { hideDotFiles, setHideDotFiles, displayFiles } = useHideDotFiles();
  const { selectedFiles, setSelectedFiles } = useSelectedFiles();

  return (
    <div className="flex-1 overflow-auto flex flex-col">
      <FileControlPanel
        hideDotFiles={hideDotFiles}
        setHideDotFiles={setHideDotFiles}
      />
      <div className="relative grow">
        <PropertiesDrawer
          propertiesTarget={propertiesTarget}
          open={showFilePropertiesDrawer}
          setShowFilePropertiesDrawer={setShowFilePropertiesDrawer}
        />
        <FileList
          displayFiles={displayFiles}
          selectedFiles={selectedFiles}
          setSelectedFiles={setSelectedFiles}
          showFilePropertiesDrawer={showFilePropertiesDrawer}
          setPropertiesTarget={setPropertiesTarget}
          handleRightClick={handleRightClick}
        />
      </div>
      {showFileContextMenu && (
        <FileContextMenu
          x={contextMenuCoords.x}
          y={contextMenuCoords.y}
          menuRef={menuRef}
          selectedFiles={selectedFiles}
          setShowFilePropertiesDrawer={setShowFilePropertiesDrawer}
          setShowFileContextMenu={setShowFileContextMenu}
        />
      )}
    </div>
  );
}
