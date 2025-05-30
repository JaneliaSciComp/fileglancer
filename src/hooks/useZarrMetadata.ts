import React from 'react';
import type { FileOrFolder } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import {
  getOmeZarrMetadata,
  generateNeuroglancerState
} from '@/omezarr-helper';
import type { Metadata } from '@/omezarr-helper';
import { useZoneBrowserContext } from '@/contexts/ZoneBrowserContext';
import { fetchFileAsJson } from '@/utils';
import { useCookies } from 'react-cookie';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';

export type OpenWithToolUrls = {
  copy: string;
  validator: string;
  neuroglancer: string;
  vole: string;
};

export default function useZarrMetadata(files: FileOrFolder[]) {
  const [thumbnailSrc, setThumbnailSrc] = React.useState<string | null>(null);
  const [openWithToolUrls, setOpenWithToolUrls] =
    React.useState<OpenWithToolUrls | null>(null);
  const [metadata, setMetadata] = React.useState<Metadata | null>(null);
  const [hasMultiscales, setHasMultiscales] = React.useState(false);
  const [loadingThumbnail, setLoadingThumbnail] = React.useState(false);

  const validatorBaseUrl = 'https://ome.github.io/ome-ngff-validator/?source=';
  const neuroglancerBaseUrl = 'https://neuroglancer-demo.appspot.com/#!';
  const voleBaseUrl = 'https://volumeviewer.allencell.org/viewer?url=';
  const { currentNavigationPath, getFileFetchPath } = useFileBrowserContext();
  const { currentFileSharePath } = useZoneBrowserContext();
  const { dataUrl } = useProxiedPathContext();
  const [cookies] = useCookies(['_xsrf']);

  const checkZattrsForMultiscales = React.useCallback(async () => {
    setHasMultiscales(false);
    setThumbnailSrc(null);
    setMetadata(null);
    setOpenWithToolUrls(null);
    const zattrsFile = files.find(file => file.name === '.zattrs');
    if (zattrsFile && currentFileSharePath) {
      try {
        const zattrs = (await fetchFileAsJson(
          `${currentFileSharePath.name}/${zattrsFile.path}`,
          cookies
        )) as any;
        console.log('Zattrs', zattrs);
        if (zattrs.multiscales) {
          setHasMultiscales(true);
          const fileFetchPath = getFileFetchPath(
            currentNavigationPath.replace('?subpath=', '/')
          );
          const imageUrl = `${window.location.origin}${fileFetchPath}`;
          setLoadingThumbnail(true);
          const metadata = await getOmeZarrMetadata(imageUrl);
          setMetadata(metadata);
          setThumbnailSrc(metadata.thumbnail);
        }
      } catch (error) {
        console.error('Error fetching OME-Zarr metadata:', error);
      } finally {
        setLoadingThumbnail(false);
      }
    }
  }, [files, currentFileSharePath, currentNavigationPath, getFileFetchPath]);

  React.useEffect(() => {
    checkZattrsForMultiscales();
  }, [checkZattrsForMultiscales]);

  React.useEffect(() => {
    setOpenWithToolUrls(null);
    if (metadata && dataUrl) {
      const openWithToolUrls = {
        copy: dataUrl,
        validator: validatorBaseUrl + dataUrl,
        vole: voleBaseUrl + dataUrl
      } as OpenWithToolUrls;
      try {
        openWithToolUrls.neuroglancer =
          neuroglancerBaseUrl +
          generateNeuroglancerState(
            dataUrl,
            metadata.zarr_version,
            metadata.multiscale,
            metadata.arr,
            metadata.omero
          );
      } catch (error) {
        console.error('Error generating neuroglancer state:', error);
      }
      setOpenWithToolUrls(openWithToolUrls);
    }
  }, [metadata, dataUrl]);

  return {
    thumbnailSrc,
    openWithToolUrls,
    metadata,
    hasMultiscales,
    loadingThumbnail
  };
}
