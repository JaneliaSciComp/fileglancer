import * as React from 'react';
import { Typography } from '@material-tailwind/react';

import type { FileOrFolder } from '@/shared.types';
import FileListCrumbs from './Crumbs';
import FileRow from './FileRow';
import ZarrPreview from './ZarrPreview';
import useZarrMetadata from '@/hooks/useZarrMetadata';

type FileListProps = {
  files: FileOrFolder[];
  selectedFiles: FileOrFolder[];
  setSelectedFiles: React.Dispatch<React.SetStateAction<FileOrFolder[]>>;
  showPropertiesDrawer: boolean;
  setPropertiesTarget: React.Dispatch<
    React.SetStateAction<FileOrFolder | null>
  >;
  hideDotFiles: boolean;
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

export default function FileList({
  files,
  selectedFiles,
  setSelectedFiles,
  showPropertiesDrawer,
  setPropertiesTarget,
  hideDotFiles,
  handleRightClick
}: FileListProps): React.ReactNode {
  const {
    thumbnailSrc,
    openWithToolUrls,
    metadata,
    hasMultiscales,
    loadingThumbnail
  } = useZarrMetadata(files);

  const displayFiles = React.useMemo(() => {
    return hideDotFiles
      ? files.filter(file => !file.name.startsWith('.'))
      : files;
  }, [files, hideDotFiles]);

  return (
    <div className="px-2 transition-all duration-300">
      <FileListCrumbs />

      {hasMultiscales ? (
        <ZarrPreview
          thumbnailSrc={thumbnailSrc}
          loadingThumbnail={loadingThumbnail}
          openWithToolUrls={openWithToolUrls}
          metadata={metadata}
        />
      ) : null}

      <div className="min-w-full bg-background select-none">
        {/* Header row */}
        <div className="min-w-fit grid grid-cols-[minmax(170px,2fr)_minmax(80px,1fr)_minmax(95px,1fr)_minmax(75px,1fr)_minmax(40px,1fr)] gap-4 p-0 text-foreground">
          <div className="flex w-full gap-3 px-3 py-1 overflow-x-auto">
            <Typography variant="small" className="font-bold">
              Name
            </Typography>
          </div>

          <Typography variant="small" className="font-bold overflow-x-auto">
            Type
          </Typography>

          <Typography variant="small" className="font-bold overflow-x-auto">
            Last Modified
          </Typography>

          <Typography variant="small" className="font-bold overflow-x-auto">
            Size
          </Typography>

          <Typography variant="small" className="font-bold overflow-x-auto">
            Actions
          </Typography>
        </div>
      </div>
      {/* File rows */}
      <div className="overflow-y-auto max-h-[calc(100vh-220px)]">
        {displayFiles.length > 0 &&
          displayFiles.map((file, index) => {
            return (
              <FileRow
                key={file.name}
                file={file}
                index={index}
                selectedFiles={selectedFiles}
                setSelectedFiles={setSelectedFiles}
                displayFiles={displayFiles}
                showPropertiesDrawer={showPropertiesDrawer}
                setPropertiesTarget={setPropertiesTarget}
                handleRightClick={handleRightClick}
              />
            );
          })}
      </div>
    </div>
  );
}
