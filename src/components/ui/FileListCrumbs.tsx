import React from 'react';
import {
  BreadcrumbLink,
  Breadcrumb,
  Typography,
  BreadcrumbSeparator
} from '@material-tailwind/react';
import {
  ChevronRightIcon,
  SlashIcon,
  Squares2X2Icon
} from '@heroicons/react/24/outline';

type FileListCrumbsProps = {
  currentPath: string;
  selectedZone: string | null;
  getFiles: (path: string) => void;
};

export default function FileListCrumbs({
  currentPath,
  selectedZone,
  getFiles
}: FileListCrumbsProps): JSX.Element {
  function getStringAfterSubstring(str: string, substring: string) {
    const index = str.indexOf(substring);
    if (index === -1) {
      return ''; // Substring not found
    }
    return str.substring(index + substring.length);
  }

  const dirArray = currentPath
    .split('/')
    .filter(item => item !== '')
    .map(segment => {
      if (segment.includes('?subpath=')) {
        return getStringAfterSubstring(segment, '?subpath=');
      }
      return segment;
    });
  console.log('FileListCrumbs dirArray', dirArray);
  const dirDepth = dirArray.length;

  return (
    <div className="w-full py-2 px-3">
      <Breadcrumb className="bg-transparent p-0">
        <div
          className="flex items-center gap-1 h-5 rounded-md hover:bg-primary-light/20 transition-colors cursor-pointer"
          onClick={() => selectedZone && getFiles(selectedZone)}
        >
          <Squares2X2Icon className="h-5 w-5 text-primary-light" />
          <ChevronRightIcon className="h-5 w-5" />
        </div>

        {/* Path segments */}
        {dirArray.map((item, index) => {
          // Render a breadcrumb link for each segment in the path
          return (
            <React.Fragment key={index}>
              <BreadcrumbLink
                variant="text"
                className="rounded-md hover:bg-primary-light/20 hover:!text-black focus:!text-black transition-colors cursor-pointer"
                onClick={() =>
                  getFiles(
                    `${selectedZone}?subpath=${dirArray.slice(0, index + 1).join('/')}`
                  )
                }
              >
                <Typography
                  variant="small"
                  className="font-medium text-primary-light"
                >
                  {item}
                </Typography>
              </BreadcrumbLink>

              {/* Add separator only if not the last segment */}
              {index < dirDepth - 1 && (
                <BreadcrumbSeparator>
                  <SlashIcon className="h-5 w-5" />
                </BreadcrumbSeparator>
              )}
            </React.Fragment>
          );
        })}
      </Breadcrumb>
    </div>
  );
}
