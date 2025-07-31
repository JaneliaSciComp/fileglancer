import React, { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  BreadcrumbLink,
  Breadcrumb,
  Typography,
  BreadcrumbSeparator,
  IconButton
} from '@material-tailwind/react';
import toast from 'react-hot-toast';
import { HiChevronRight, HiOutlineDuplicate } from 'react-icons/hi';
import { HiMiniSlash, HiOutlineSquares2X2 } from 'react-icons/hi2';

import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import {
  getPreferredPathForDisplay,
  makeBrowseLink,
  makePathSegmentArray,
  joinPaths
} from '@/utils';
import { copyToClipboard } from '@/utils/copyText';

export default function Crumbs(): ReactNode {
  const { currentFileSharePath, currentFolder } = useFileBrowserContext();
  const { pathPreference } = usePreferencesContext();

  const dirArray = makePathSegmentArray(currentFolder?.path || '');
  // Add the current file share path name as the first segment in the array
  if (currentFileSharePath) {
    dirArray.unshift(
      getPreferredPathForDisplay(pathPreference, currentFileSharePath)
    );
  }

  const dirDepth = dirArray.length;

  const fullPath = getPreferredPathForDisplay(
    pathPreference,
    currentFileSharePath,
    currentFolder?.path
  );

  return (
    <div className="w-full py-2 px-3">
      <Breadcrumb className="bg-transparent p-0 group">
        <div className="flex items-center gap-1 h-5">
          <HiOutlineSquares2X2 className="icon-default text-primary-light" />
          <HiChevronRight className="icon-default" />
        </div>

        {/* Path segments */}
        {dirArray.map((pathSegment, index) => {
          if (currentFileSharePath) {
            const path = joinPaths(...dirArray.slice(1, index + 1));
            const link = makeBrowseLink(currentFileSharePath.name, path);

            if (index < dirDepth - 1) {
              // Render a breadcrumb link for each segment in the parent path
              return (
                <React.Fragment key={pathSegment + '-' + index}>
                  <BreadcrumbLink
                    as={Link}
                    to={link}
                    variant="text"
                    className="rounded-md hover:bg-primary-light/20 hover:!text-black focus:!text-black transition-colors cursor-pointer"
                  >
                    <Typography
                      variant="small"
                      className="font-medium text-primary-light"
                    >
                      {pathSegment}
                    </Typography>
                  </BreadcrumbLink>
                  {/* Add separator since is not the last segment */}
                  <BreadcrumbSeparator>
                    {pathPreference[0] === 'windows_path' ? (
                      <HiMiniSlash className="icon-default transform scale-x-[-1]" />
                    ) : (
                      <HiMiniSlash className="icon-default" />
                    )}
                  </BreadcrumbSeparator>
                </React.Fragment>
              );
            } else {
              // Render the last path component as text only
              return (
                <React.Fragment key={pathSegment + '-' + index}>
                  <Typography className="font-medium text-primary-default">
                    {pathSegment}
                  </Typography>
                </React.Fragment>
              );
            }
          }
        })}
        <IconButton
          variant="ghost"
          className="text-transparent group-hover:text-foreground"
          onClick={() => {
            try {
              copyToClipboard(fullPath);
              toast.success('Path copied to clipboard!');
            } catch (error) {
              toast.error(`Failed to copy path. Error: ${error}`);
            }
          }}
        >
          <HiOutlineDuplicate className="icon-small" />
        </IconButton>
      </Breadcrumb>
    </div>
  );
}
