import * as React from 'react';
import { Checkbox, Typography } from '@material-tailwind/react';
import { EmptyPage, Folder } from 'iconoir-react';

import FileListCrumbs from './FileListCrumbs';

import { File } from '../../hooks/useFileBrowser';
import { formatDate, formatFileSize } from '../../utils';

type FileListProps = {
  displayFiles: File[];
  currentPath: string;
  checked: string[];
  selectedZone: string | null;
  handleCheckboxToggle: (file: File) => void;
  getFiles: (path: string) => void;
  showFileDrawer: boolean;
  handleFileClick: (e: React.MouseEvent<HTMLDivElement>, file: File) => void;
  selectedFile: File | null;
};

export default function FileList({
  displayFiles,
  currentPath,
  checked,
  selectedZone,
  handleCheckboxToggle,
  getFiles,
  showFileDrawer,
  handleFileClick,
  selectedFile
}: FileListProps) {
  console.log('Files to display in file list', displayFiles);

  return (
    <div
      className={`mx-2 transition-all duration-300 ${showFileDrawer ? 'mr-[350px]' : ''}`}
    >
      <FileListCrumbs
        currentPath={currentPath}
        selectedZone={selectedZone}
        getFiles={getFiles}
      />
      <div className="min-w-full bg-background">
        {/* Header row */}
        <div className="grid grid-cols-[minmax(200px,2fr)_minmax(85px,1fr)_minmax(100px,1fr)_minmax(75px,1fr)_20px] gap-4 p-0 text-foreground">
          <div className="flex w-full gap-3 px-3 py-1">
            <div className="w-[1.25rem] h-5"></div>
            <Typography variant="small" className="font-bold">
              Name
            </Typography>
          </div>

          <Typography variant="small" className="font-bold">
            Type
          </Typography>

          <Typography variant="small" className="font-bold">
            Last Modified
          </Typography>

          <Typography variant="small" className="font-bold">
            Size
          </Typography>

          <div className="w-[1.5em] h-[1.5em]"></div>
        </div>

        {/* File rows */}
        {displayFiles.length > 0 &&
          displayFiles.map((file, index) => {
            const labelId = `checkbox-list-label-${file.name}`;
            const isChecked = checked.includes(file.name);

            return (
              <div
                key={file.name}
                className={`grid grid-cols-[minmax(200px,2fr)_minmax(85px,1fr)_minmax(100px,1fr)_minmax(75px,1fr)_20px] gap-4 hover:bg-primary-light/30 focus:bg-primary-light/30 ${(isChecked || file === selectedFile) && 'bg-primary-light/30'} ${index % 2 === 0 && !isChecked && file !== selectedFile && 'bg-surface/50'}  `}
                onClick={(e: React.MouseEvent<HTMLDivElement>) =>
                  handleFileClick(e, file)
                }
                onContextMenu={(e: React.MouseEvent<HTMLDivElement>) =>
                  handleFileClick(e, file)
                }
              >
                {/* Name column */}
                <div className="flex items-center w-full gap-3 pl-3 py-1 text-primary-light">
                  <span
                    className="checkbox-wrapper"
                    onClick={(e: React.MouseEvent<HTMLSpanElement>) => {
                      e.stopPropagation();
                    }}
                  >
                    <Checkbox
                      id={labelId}
                      checked={isChecked}
                      onChange={() => handleCheckboxToggle(file)}
                      className="border-foreground/70 dark:shadow-white/5"
                    >
                      <Checkbox.Indicator />
                    </Checkbox>
                  </span>

                  <Typography
                    variant="small"
                    className="font-medium cursor-pointer"
                    onClick={(e: React.MouseEvent<HTMLSpanElement>) => {
                      e.stopPropagation();
                      if (file.is_dir) {
                        getFiles(`${selectedZone}?subpath=${file.path}`);
                      }
                    }}
                  >
                    {file.name}
                  </Typography>
                </div>

                {/* Type column */}
                <div className="flex items-center w-full gap-3 py-1 text-grey-700 ">
                  {file.is_dir ? (
                    <Folder className="text-foreground" />
                  ) : (
                    <EmptyPage className="text-foreground" />
                  )}
                  <Typography variant="small" className="font-medium">
                    {file.is_dir ? 'Folder' : 'File'}
                  </Typography>
                </div>

                {/* Last Modified column */}
                <div className="py-1 text-grey-700  flex items-center">
                  <Typography variant="small" className="font-medium">
                    {formatDate(file.last_modified)}
                  </Typography>
                </div>

                {/* Size column */}
                <div className="py-1 text-grey-700 flex items-center">
                  <Typography variant="small" className="font-medium">
                    {file.is_dir ? '—' : formatFileSize(file.size)}
                  </Typography>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
