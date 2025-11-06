import { Fragment } from 'react';
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

import { FgStyledLink } from '../widgets/FgLink';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import {
  getPreferredPathForDisplay,
  makeBrowseLink,
  makePathSegmentArray,
  joinPaths
} from '@/utils';
import { copyToClipboard } from '@/utils/copyText';

export default function Crumbs() {
  const { filePath, fileQuery, fileBrowserState } = useFileBrowserContext();
  const { pathPreference } = usePreferencesContext();

  const currentFileSharePath = fileBrowserState.uiFileSharePath;
  const dirArray = makePathSegmentArray(filePath || '');

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
    filePath
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
            const isFile =
              fileQuery.data?.currentFileOrFolder &&
              !fileQuery.data.currentFileOrFolder.is_dir &&
              index === dirDepth - 1;

            if (index < dirDepth - 1) {
              const path = joinPaths(...dirArray.slice(1, index + 1));
              const link = makeBrowseLink(currentFileSharePath.name, path);
              // Render a breadcrumb link for each segment in the parent path
              return (
                <Fragment key={pathSegment + '-' + index}>
                  <BreadcrumbLink as={FgStyledLink} to={link}>
                    <Typography
                      className="font-medium text-primary-light"
                      variant="small"
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
                </Fragment>
              );
            } else {
              // Render the last path component as text only
              // If it's a file, make it visually distinct
              return (
                <Fragment key={pathSegment + '-' + index}>
                  <Typography
                    className={`font-medium ${
                      isFile
                        ? 'text-primary-default italic'
                        : 'text-primary-default'
                    }`}
                  >
                    {pathSegment}
                  </Typography>
                </Fragment>
              );
            }
          }
        })}
        <IconButton
          className="text-transparent group-hover:text-foreground"
          onClick={() => {
            try {
              copyToClipboard(fullPath);
              toast.success('Path copied to clipboard!');
            } catch (error) {
              toast.error(`Failed to copy path. Error: ${error}`);
            }
          }}
          variant="ghost"
        >
          <HiOutlineDuplicate className="icon-small" />
        </IconButton>
      </Breadcrumb>
    </div>
  );
}
