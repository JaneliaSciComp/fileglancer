import * as React from 'react';
import { Typography } from '@material-tailwind/react';
import * as zarr from 'zarrita';
import * as omezarr from 'ome-zarr.js';

import type { File } from '../../../shared.types';
import FileListCrumbs from './Crumbs';
import FileRow from './FileRow';
import { useZoneBrowserContext } from '../../../contexts/ZoneBrowserContext';
import { useFileBrowserContext } from '../../../contexts/FileBrowserContext';
import { fetchFileAsJson } from '../../../utils';
import { useCookiesContext } from '../../../contexts/CookiesContext';
type FileListProps = {
  files: File[];
  selectedFiles: File[];
  setSelectedFiles: React.Dispatch<React.SetStateAction<File[]>>;
  showPropertiesDrawer: boolean;
  setPropertiesTarget: React.Dispatch<React.SetStateAction<File | null>>;
  hideDotFiles: boolean;
  handleRightClick: (
    e: React.MouseEvent<HTMLDivElement>,
    file: File,
    selectedFiles: File[],
    setSelectedFiles: React.Dispatch<React.SetStateAction<File[]>>,
    setPropertiesTarget: React.Dispatch<React.SetStateAction<File | null>>
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
  const { currentNavigationPath, getFileFetchPath } = useFileBrowserContext();
  const { currentFileSharePath } = useZoneBrowserContext();
  const { cookies } = useCookiesContext();
  const displayFiles = React.useMemo(() => {
    return hideDotFiles
      ? files.filter(file => !file.name.startsWith('.'))
      : files;
  }, [files, hideDotFiles]);

  const [hasMultiscales, setHasMultiscales] = React.useState(false);
  const [thumbnailSrc, setThumbnailSrc] = React.useState<string | null>(null);
  const [neuroglancerUrl, setNeuroglancerUrl] = React.useState<string | null>(
    null
  );
  const neuroglancerUrlPattern =
    'https://neuroglancer-demo.appspot.com/#!{%22layers%22:[{%22source%22:%22zarr://{URL}%22,%22name%22:%22OME-NGFF%22}]}';

  React.useEffect(() => {
    const checkZattrsForMultiscales = async () => {
      const zattrsFile = files.find(file => file.name === '.zattrs');
      setHasMultiscales(false);
      if (zattrsFile && currentFileSharePath) {
        const zattrsUrl = `${currentFileSharePath.name}/${zattrsFile.path}`;
        const zattrsContent = await fetchFileAsJson(zattrsUrl, cookies);
        if (zattrsContent && 'multiscales' in zattrsContent) {
          setHasMultiscales(true);
          const fileFetchPath = getFileFetchPath(
            currentNavigationPath.replace('?subpath=', '/')
          );
          const imageUrl = `${window.location.origin}${fileFetchPath}`;
          try {
            const store = new zarr.FetchStore(imageUrl);
            const src = await omezarr.renderThumbnail(store);
            setThumbnailSrc(src);
          } catch (error) {
            console.error('Error rendering thumbnail', error);
          }

          const neuroglancerUrl = neuroglancerUrlPattern.replace(
            '{URL}',
            imageUrl
          );
          setNeuroglancerUrl(neuroglancerUrl);
        }
      }
    };

    checkZattrsForMultiscales();
  }, [files, fetchFileAsJson, currentFileSharePath]);

  return (
    <div
      className={`px-2 transition-all duration-300 ${showPropertiesDrawer ? 'mr-[350px]' : ''}`}
    >
      <FileListCrumbs />

      {hasMultiscales ? (
        <div className="my-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
          <Typography
            variant="small"
            className="text-blue-600 dark:text-blue-400"
          >
            This directory contains an OME-Zarr image
          </Typography>

          {thumbnailSrc ? (
            <img id="thumbnail" src={thumbnailSrc} alt="Thumbnail" />
          ) : null}

          {neuroglancerUrl ? (
            <a href={neuroglancerUrl} target="_blank" rel="noopener noreferrer">
              <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 dark:bg-blue-400 dark:hover:bg-blue-500">
                View in Neuroglancer
              </button>
            </a>
          ) : null}
        </div>
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

        {/* File rows */}
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
