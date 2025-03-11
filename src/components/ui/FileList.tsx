import * as React from 'react';
import { Typography } from '@material-tailwind/react';
import { CustomCheckbox } from './CustomCheckbox';
import { EmptyPage, Folder, MoreVert } from 'iconoir-react';

import FileListCrumbs from './FileListCrumbs';

type FileListProps = {
  files: File[];
  currentPath: string;
  checked: string[];
  handleCheckboxToggle: (file: File) => void;
  getFiles: (path: string) => void;
};

const formatFileSize = (sizeInBytes: number): string => {
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} bytes`;
  } else if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(0)} KB`;
  } else if (sizeInBytes < 1024 * 1024 * 1024) {
    return `${(sizeInBytes / (1024 * 1024)).toFixed(0)} MB`;
  } else {
    return `${(sizeInBytes / (1024 * 1024 * 1024)).toFixed(0)} GB`;
  }
};

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

export default function FileList({
  files,
  currentPath,
  checked,
  handleCheckboxToggle,
  getFiles
}: FileListProps): JSX.Element {
  return (
    <>
      <FileListCrumbs currentPath={currentPath} getFiles={getFiles} />
      <div className="min-w-full bg-white">
        {/* Header row */}
        <div className="grid grid-cols-5 gap-4 p-0 text-gray-700">
          <div className="flex w-full gap-3 px-3 py-1">
            <div className="w-5 h-5"></div>
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
        {files.length > 0 &&
          files.map((file, index) => {
            const labelId = `checkbox-list-label-${file.name}`;
            const isChecked = checked.includes(file.name);

            return (
              <div
                key={file.name}
                className={`grid grid-cols-5 gap-4 hover:bg-blue-50/50 ${isChecked && 'bg-blue-50/50'} ${index % 2 === 0 && 'bg-gray-50'}`}
              >
                {/* Name column */}
                <div className="flex items-center w-full gap-3 px-3 py-1  text-blue-500">
                  <div
                    className="cursor-pointer"
                    onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                      e.stopPropagation();
                      handleCheckboxToggle(file);
                    }}
                  >
                    <CustomCheckbox id={labelId} checked={isChecked} />
                  </div>

                  <Typography
                    variant="small"
                    className="font-medium cursor-pointer"
                    onClick={(e: React.MouseEvent<HTMLSpanElement>) => {
                      e.stopPropagation();
                      if (file.is_dir) {
                        getFiles(file.path);
                      }
                    }}
                  >
                    {file.name}
                  </Typography>
                </div>

                {/* Type column */}
                <div className="flex items-center w-full gap-3 py-1 text-grey-700 ">
                  {file.is_dir ? (
                    <Folder className="text-gray-700" />
                  ) : (
                    <EmptyPage className="text-gray-700" />
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

                {/* Actions column */}
                <div className="flex items-center w-full gap-3 py-1 text-blue-500 cursor-pointer">
                  <MoreVert />
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
}
