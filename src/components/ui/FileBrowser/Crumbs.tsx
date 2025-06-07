import React, { ReactNode } from 'react';
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

import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useZoneBrowserContext } from '@/contexts/ZoneBrowserContext';

export default function Crumbs(): ReactNode {
  const { dirArray, fetchAndFormatFilesForDisplay } = useFileBrowserContext();
  const { currentFileSharePath } = useZoneBrowserContext();

  const dirDepth = dirArray.length;
  return (
    <div className="w-full py-2 px-3">
      <Breadcrumb className="bg-transparent p-0">
        <div className="flex items-center gap-1 h-5">
          <Squares2X2Icon className="icon-default text-primary-light" />
          <ChevronRightIcon className="icon-default" />
        </div>

        {/* Path segments */}
        {dirArray.map((item, index) => {
          if (index < dirDepth - 1) {
            // Render a breadcrumb link for each segment in the parent path
            return (
              <React.Fragment key={item + '-' + index}>
                <BreadcrumbLink
                  variant="text"
                  className="rounded-md hover:bg-primary-light/20 hover:!text-black focus:!text-black transition-colors cursor-pointer"
                  onClick={() => {
                    if (index === 0 && currentFileSharePath) {
                      fetchAndFormatFilesForDisplay(
                        `${currentFileSharePath.name}`
                      );
                    } else if (currentFileSharePath) {
                      fetchAndFormatFilesForDisplay(
                        `${currentFileSharePath.name}?subpath=${dirArray.slice(1, index + 1).join('/')}`
                      );
                    }
                  }}
                >
                  <Typography
                    variant="small"
                    className="font-medium text-primary-light"
                  >
                    {item}
                  </Typography>
                </BreadcrumbLink>
                {/* Add separator since is not the last segment */}
                <BreadcrumbSeparator>
                  <SlashIcon className="icon-default" />
                </BreadcrumbSeparator>
              </React.Fragment>
            );
          } else {
            // Render the last path component as text only
            return (
              <React.Fragment key={item + '-' + index}>
                <Typography
                  variant="small"
                  className="font-medium text-primary-default"
                >
                  {item}
                </Typography>
              </React.Fragment>
            );
          }
        })}
      </Breadcrumb>
    </div>
  );
}
