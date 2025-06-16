import React, { ReactNode } from 'react';
import { IconButton, Tooltip, Typography } from '@material-tailwind/react';
import { DocumentIcon, FolderIcon } from '@heroicons/react/24/outline';
import { HiOutlineEllipsisHorizontalCircle } from 'react-icons/hi2';
import toast from 'react-hot-toast';

import type { FileOrFolder } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import useHandleLeftClick from '@/hooks/useHandleLeftClick';
import { formatUnixTimestamp, formatFileSize } from '@/utils/index';

type FileRowProps = {
  file: FileOrFolder;
  index: number;
  selectedFiles: FileOrFolder[];
  setSelectedFiles: React.Dispatch<React.SetStateAction<FileOrFolder[]>>;
  displayFiles: FileOrFolder[];
  showPropertiesDrawer: boolean;
  setPropertiesTarget: React.Dispatch<
    React.SetStateAction<FileOrFolder | null>
  >;
  handleRightClick: (
    e: React.MouseEvent<HTMLDivElement>,
    file: FileOrFolder,
    selectedFiles: FileOrFolder[],
    setSelectedFiles: React.Dispatch<React.SetStateAction<FileOrFolder[]>>,
    setPropertiesTarget: React.Dispatch<
      React.SetStateAction<FileOrFolder | null>
    >
  ) => void;
};

export default function FileRow({
  file,
  index,
  selectedFiles,
  setSelectedFiles,
  displayFiles,
  showPropertiesDrawer,
  setPropertiesTarget,
  handleRightClick
}: FileRowProps): ReactNode {
  const nameRef = React.useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = React.useState(false);

  const { handleFileBrowserNavigation, currentFileSharePath } =
    useFileBrowserContext();
  const { handleLeftClick } = useHandleLeftClick();

  const isSelected = selectedFiles.some(
    selectedFile => selectedFile.name === file.name
  );

  React.useEffect(() => {
    const checkTruncation = () => {
      if (nameRef.current) {
        setIsTruncated(
          nameRef.current.scrollWidth > nameRef.current.clientWidth
        );
      }
    };
    checkTruncation();
    window.addEventListener('resize', checkTruncation);
    return () => window.removeEventListener('resize', checkTruncation);
  }, [file.name]);

  const handleNavigationClick = async (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (file.is_dir) {
      const result = await handleFileBrowserNavigation({
        fspName: currentFileSharePath?.name,
        path: file.path
      });

      if (result.error) {
        toast.error(`Failed to open folder: ${result.error}`);
        return;
      }

      setPropertiesTarget(file);
    }
  };

  return (
    <div
      className={`cursor-pointer grid grid-cols-[minmax(170px,2fr)_minmax(80px,1fr)_minmax(95px,1fr)_minmax(75px,1fr)_minmax(40px,1fr)] gap-4 hover:bg-primary-light/30 focus:bg-primary-light/30 ${isSelected && 'bg-primary-light/30'} ${index % 2 === 0 && !isSelected && 'bg-surface/50'}  `}
      onClick={(e: React.MouseEvent<HTMLDivElement>) =>
        handleLeftClick(
          e,
          file,
          selectedFiles,
          setSelectedFiles,
          displayFiles,
          setPropertiesTarget,
          showPropertiesDrawer
        )
      }
      onContextMenu={(e: React.MouseEvent<HTMLDivElement>) =>
        handleRightClick(
          e,
          file,
          selectedFiles,
          setSelectedFiles,
          setPropertiesTarget
        )
      }
      onDoubleClick={e => handleNavigationClick(e)}
    >
      {/* Name column */}
      <div className="flex items-center gap-3 pl-3 py-1">
        {isTruncated ? (
          <Tooltip>
            <Tooltip.Trigger className="max-w-full">
              <Typography
                ref={nameRef}
                variant="small"
                className="font-medium text-primary-light hover:underline truncate"
                onClick={(e: React.MouseEvent<HTMLElement>) => {
                  if (e.detail === 1) {
                    handleNavigationClick(e);
                  }
                }}
              >
                {file.name}
              </Typography>
            </Tooltip.Trigger>
            <Tooltip.Content>{file.name}</Tooltip.Content>
          </Tooltip>
        ) : (
          <Typography
            ref={nameRef}
            variant="small"
            className="font-medium text-primary-light hover:underline truncate"
            onClick={(e: React.MouseEvent<HTMLElement>) => {
              if (e.detail === 1) {
                handleNavigationClick(e);
              }
            }}
          >
            {file.name}
          </Typography>
        )}
      </div>

      {/* Type column */}
      <div className="flex items-center w-full gap-3 py-1 text-grey-700 overflow-x-auto">
        {file.is_dir ? (
          <FolderIcon className="text-foreground icon-default" />
        ) : (
          <DocumentIcon className="text-foreground icon-default" />
        )}
        <Typography variant="small" className="font-medium">
          {file.is_dir ? 'Folder' : 'File'}
        </Typography>
      </div>

      {/* Last Modified column */}
      <div className="py-1 text-grey-700  flex items-center overflow-x-auto">
        <Typography variant="small" className="font-medium">
          {formatUnixTimestamp(file.last_modified)}
        </Typography>
      </div>

      {/* Size column */}
      <div className="py-1 text-grey-700 flex items-center overflow-x-auto">
        <Typography variant="small" className="font-medium">
          {file.is_dir ? '—' : formatFileSize(file.size)}
        </Typography>
      </div>

      {/* Context menu button */}
      <div
        className="py-1 text-grey-700 flex items-center flex-shrink-0"
        onClick={e => {
          handleRightClick(
            e,
            file,
            selectedFiles,
            setSelectedFiles,
            setPropertiesTarget
          );
        }}
      >
        <IconButton variant="ghost">
          <HiOutlineEllipsisHorizontalCircle className="icon-default text-foreground" />
        </IconButton>
      </div>
    </div>
  );
}
