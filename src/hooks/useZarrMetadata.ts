import React from 'react';
import { default as log } from '@/logger';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import {
  getOmeZarrMetadata,
  getOmeZarrThumbnail,
  getZarrArray,
  generateNeuroglancerStateForDataURL,
  generateNeuroglancerStateForZarrArray,
  generateNeuroglancerStateForOmeZarr,
  getLayerType
} from '@/omezarr-helper';
import type { Metadata } from '@/omezarr-helper';
import { fetchFileAsJson, getFileURL } from '@/utils';
import { useCookies } from 'react-cookie';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useExternalBucketContext } from '@/contexts/ExternalBucketContext';
import * as zarr from 'zarrita';

export type OpenWithToolUrls = {
  copy: string;
  validator: string;
  neuroglancer: string;
  vole: string;
  avivator: string;
};

export type ZarrArray = zarr.Array<any>;
export type ZarrMetadata = Metadata | null;

export default function useZarrMetadata() {
  const [thumbnailSrc, setThumbnailSrc] = React.useState<string | null>(null);
  const [openWithToolUrls, setOpenWithToolUrls] =
    React.useState<OpenWithToolUrls | null>(null);
  const [metadata, setMetadata] = React.useState<ZarrMetadata>(null);
  const [omeZarrUrl, setOmeZarrUrl] = React.useState<string | null>(null);
  const [loadingThumbnail, setLoadingThumbnail] = React.useState(false);
  const [thumbnailError, setThumbnailError] = React.useState<string | null>(
    null
  );
  const notifiedPathRef = React.useRef<string | null>(null);
  const [layerType, setLayerType] = React.useState<
    'auto' | 'image' | 'segmentation' | null
  >(null);

  const validatorBaseUrl = 'https://ome.github.io/ome-ngff-validator/?source=';
  const neuroglancerBaseUrl = 'https://neuroglancer-demo.appspot.com/#!';
  const voleBaseUrl = 'https://volumeviewer.allencell.org/viewer?url=';
  const avivatorBaseUrl = 'https://avivator.gehlenborglab.org/?image_url=';
  const { fileBrowserState, areFileDataLoading } = useFileBrowserContext();
  const { dataUrl, notifyZarrDetected } = useProxiedPathContext();
  const { externalDataUrl } = useExternalBucketContext();
  const {
    disableNeuroglancerStateGeneration,
    disableHeuristicalLayerTypeDetection
  } = usePreferencesContext();
  const [cookies] = useCookies(['_xsrf']);

  const notifyZarrDetectedOnce = React.useCallback((): void => {
    if (fileBrowserState.currentFileOrFolder) {
      const currentPath = fileBrowserState.currentFileOrFolder.path;
      if (notifiedPathRef.current !== currentPath) {
        notifyZarrDetected();
        notifiedPathRef.current = currentPath;
      }
    }
  }, [fileBrowserState.currentFileOrFolder, notifyZarrDetected]);

  const checkZarrArray = React.useCallback(
    async (
      imageUrl: string,
      zarrVersion: 2 | 3,
      cancelRef: { cancel: boolean }
    ): Promise<void> => {
      log.info(
        'Getting Zarr array for',
        imageUrl,
        'with Zarr version',
        zarrVersion
      );
      setThumbnailError(null);
      try {
        const arr = await getZarrArray(imageUrl, zarrVersion);
        if (cancelRef.cancel) {
          return;
        }
        const shapes = [arr.shape];
        setMetadata({
          arr,
          shapes,
          multiscale: undefined,
          omero: undefined,
          scales: undefined,
          zarrVersion: zarrVersion
        });
        // Notify proxied path context that Zarr has been detected - but only once per path
        notifyZarrDetectedOnce();
      } catch (error) {
        log.error('Error fetching Zarr array:', error);
        if (cancelRef.cancel) {
          return;
        }
        setThumbnailError('Error fetching Zarr array');
      }
    },
    [notifyZarrDetectedOnce]
  );

  const checkOmeZarrMetadata = React.useCallback(
    async (
      imageUrl: string,
      zarrVersion: 2 | 3,
      cancelRef: { cancel: boolean }
    ) => {
      log.info(
        'Getting OME-Zarr metadata for',
        imageUrl,
        'with Zarr version',
        zarrVersion
      );
      setThumbnailError(null);
      try {
        setOmeZarrUrl(imageUrl);
        const metadata = await getOmeZarrMetadata(imageUrl);
        if (cancelRef.cancel) {
          return;
        }
        setMetadata(metadata);
        setLoadingThumbnail(true);
        // Notify proxied path context that Zarr has been detected - but only once per path
        notifyZarrDetectedOnce();
      } catch (error) {
        log.error('Exception fetching OME-Zarr metadata:', imageUrl, error);
        if (cancelRef.cancel) {
          return;
        }
        setThumbnailError('Error fetching OME-Zarr metadata');
      }
    },
    [notifyZarrDetectedOnce]
  );

  const getFile = React.useCallback(
    async (fileName: string) => {
      return fileBrowserState.files.find(file => file.name === fileName);
    },
    [fileBrowserState.files]
  );

  const checkZarrMetadata = React.useCallback(
    async (cancelRef: { cancel: boolean }) => {
      if (areFileDataLoading) {
        return;
      }
      setMetadata(null);
      setOmeZarrUrl(null);
      setThumbnailSrc(null);
      setThumbnailError(null);
      setLoadingThumbnail(false);
      setOpenWithToolUrls(null);
      setLayerType(null);
      notifiedPathRef.current = null;

      if (
        fileBrowserState.currentFileSharePath &&
        fileBrowserState.currentFileOrFolder
      ) {
        const imageUrl = getFileURL(
          fileBrowserState.currentFileSharePath.name,
          fileBrowserState.currentFileOrFolder.path
        );

        const zarrayFile = await getFile('.zarray');
        if (zarrayFile) {
          await checkZarrArray(imageUrl, 2, cancelRef);
        } else {
          const zattrsFile = await getFile('.zattrs');
          if (zattrsFile) {
            const attrs = (await fetchFileAsJson(
              fileBrowserState.currentFileSharePath.name,
              zattrsFile.path,
              cookies
            )) as any;
            if (attrs.multiscales) {
              checkOmeZarrMetadata(imageUrl, 2, cancelRef);
            }
          } else {
            const zarrJsonFile = await getFile('zarr.json');
            if (zarrJsonFile) {
              const attrs = (await fetchFileAsJson(
                fileBrowserState.currentFileSharePath.name,
                zarrJsonFile.path,
                cookies
              )) as any;
              if (attrs.node_type === 'array') {
                checkZarrArray(imageUrl, 3, cancelRef);
              } else if (attrs.node_type === 'group') {
                if (attrs.attributes?.ome?.multiscales) {
                  checkOmeZarrMetadata(imageUrl, 3, cancelRef);
                } else {
                  log.info('Zarrv3 group has no multiscales', attrs.attributes);
                }
              } else {
                log.warn('Unknown Zarrv3 node type', attrs.node_type);
              }
            }
          }
        }
      }
    },
    [
      checkOmeZarrMetadata,
      checkZarrArray,
      areFileDataLoading,
      fileBrowserState.currentFileSharePath,
      fileBrowserState.currentFileOrFolder,
      getFile,
      cookies
    ]
  );

  // When the file browser state changes, check for Zarr metadata
  React.useEffect(() => {
    const cancelRef = { cancel: false };
    checkZarrMetadata(cancelRef);
    return () => {
      cancelRef.cancel = true;
    };
  }, [checkZarrMetadata]);

  // When an OME-Zarr URL is set, load the thumbnail
  React.useEffect(() => {
    if (!omeZarrUrl) {
      return;
    }

    const controller = new AbortController();

    const loadThumbnail = async (signal: AbortSignal) => {
      try {
        const [thumbnail, error] = await getOmeZarrThumbnail(omeZarrUrl);
        if (signal.aborted) {
          return;
        }

        setLoadingThumbnail(false);
        if (error) {
          console.error('Thumbnail load failed:', error);
          setThumbnailError(error);
        } else {
          setThumbnailSrc(thumbnail);
        }
      } catch (err) {
        if (!signal.aborted) {
          console.error('Unexpected error loading thumbnail:', err);
          setThumbnailError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    loadThumbnail(controller.signal);

    return () => {
      controller.abort();
    };
  }, [omeZarrUrl]);

  // Run tool url generation when the proxied path url or metadata changes
  React.useEffect(() => {
    setOpenWithToolUrls(null);
    console.log(
      'Updating OpenWithToolUrls with metadata ',
      metadata,
      ' and dataUrl ',
      dataUrl,
      ' and externalDataUrl ',
      externalDataUrl
    );
    // Always create openWithToolUrls data structure when metadata is available
    if (metadata) {
      const url = externalDataUrl || dataUrl;

      (async () => {
        const determinedLayerType = await getLayerType(
          metadata,
          !disableHeuristicalLayerTypeDetection
        );
        console.log('Determined layer type:', determinedLayerType);
        setLayerType(determinedLayerType);

        const openWithToolUrls = {
          copy: url || ''
        } as OpenWithToolUrls;

        // Determine which tools should be available based on metadata type
        if (metadata && metadata?.multiscale) {
          // OME-Zarr - all tools available
          if (url) {
            // Populate with actual URLs when proxied path is available
            openWithToolUrls.validator = validatorBaseUrl + url;
            openWithToolUrls.vole = voleBaseUrl + url;
            openWithToolUrls.avivator = avivatorBaseUrl + url;
            if (disableNeuroglancerStateGeneration) {
              openWithToolUrls.neuroglancer =
                neuroglancerBaseUrl + generateNeuroglancerStateForDataURL(url);
            } else {
              try {
                openWithToolUrls.neuroglancer =
                  neuroglancerBaseUrl +
                  generateNeuroglancerStateForOmeZarr(
                    url,
                    metadata.zarrVersion,
                    determinedLayerType,
                    metadata.multiscale,
                    metadata.arr,
                    metadata.omero
                  );
              } catch (error) {
                log.error(
                  'Error generating Neuroglancer state for OME-Zarr:',
                  error
                );
                openWithToolUrls.neuroglancer =
                  neuroglancerBaseUrl +
                  generateNeuroglancerStateForDataURL(url);
              }
            }
          } else {
            // No proxied URL - show all tools as available but empty
            openWithToolUrls.validator = '';
            openWithToolUrls.vole = '';
            openWithToolUrls.avivator = '';
            openWithToolUrls.neuroglancer = '';
          }
        } else {
          // Non-OME Zarr - only Neuroglancer available
          if (url) {
            openWithToolUrls.validator = '';
            openWithToolUrls.vole = '';
            openWithToolUrls.avivator = '';
            if (disableNeuroglancerStateGeneration) {
              openWithToolUrls.neuroglancer =
                neuroglancerBaseUrl + generateNeuroglancerStateForDataURL(url);
            } else {
              openWithToolUrls.neuroglancer =
                neuroglancerBaseUrl +
                generateNeuroglancerStateForZarrArray(
                  url,
                  metadata.zarrVersion,
                  determinedLayerType
                );
            }
          } else {
            // No proxied URL - only show Neuroglancer as available but empty
            openWithToolUrls.validator = '';
            openWithToolUrls.vole = '';
            openWithToolUrls.avivator = '';
            openWithToolUrls.neuroglancer = '';
          }
        }
        setOpenWithToolUrls(openWithToolUrls);
      })();
    }
  }, [
    metadata,
    dataUrl,
    externalDataUrl,
    disableNeuroglancerStateGeneration,
    disableHeuristicalLayerTypeDetection
  ]);

  return {
    thumbnailSrc,
    openWithToolUrls,
    metadata,
    loadingThumbnail,
    thumbnailError,
    layerType
  };
}
