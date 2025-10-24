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
  determineLayerType
} from '@/omezarr-helper';
import type { Metadata } from '@/omezarr-helper';
import { fetchFileAsJson, getFileURL } from '@/utils';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useExternalBucketContext } from '@/contexts/ExternalBucketContext';
import * as zarr from 'zarrita';
import { FileOrFolder } from '@/shared.types';

export type OpenWithToolUrls = {
  copy: string;
  validator: string | null;
  neuroglancer: string;
  vole: string | null;
  avivator: string | null;
};

export type PendingToolKey = keyof OpenWithToolUrls | null;
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
  const avivatorBaseUrl = 'https://janeliascicomp.github.io/viv/?image_url=';
  const { fileQuery, fileBrowserState } = useFileBrowserContext();
  const { proxiedPathByFspAndPathQuery } = useProxiedPathContext();
  const { externalDataUrl } = useExternalBucketContext();
  const {
    disableNeuroglancerStateGeneration,
    disableHeuristicalLayerTypeDetection,
    useLegacyMultichannelApproach
  } = usePreferencesContext();

  const checkZarrArray = React.useCallback(
    async (
      imageUrl: string,
      zarrVersion: 2 | 3,
      signal: AbortSignal
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
        if (signal.aborted) {
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
      } catch (error) {
        log.error('Error fetching Zarr array:', error);
        if (signal.aborted) {
          return;
        }
        setThumbnailError('Error fetching Zarr array');
      }
    },
    []
  );

  const checkOmeZarrMetadata = React.useCallback(
    async (imageUrl: string, zarrVersion: 2 | 3, signal: AbortSignal) => {
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
        if (signal.aborted) {
          return;
        }
        setMetadata(metadata);
        setLoadingThumbnail(true);
      } catch (error) {
        log.error('Exception fetching OME-Zarr metadata:', imageUrl, error);
        if (signal.aborted) {
          return;
        }
        setThumbnailError('Error fetching OME-Zarr metadata');
      }
    },
    []
  );

  const getFile = React.useCallback(
    (fileName: string) => {
      if (!fileQuery.data?.files) {
        return undefined;
      }
      return fileQuery.data.files.find(
        (file: FileOrFolder) => file.name === fileName
      );
    },
    [fileQuery.data?.files]
  );

  const checkZarrMetadata = React.useCallback(
    async (signal: AbortSignal) => {
      if (fileQuery.isPending || !fileQuery.data) {
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
        fileBrowserState.uiFileSharePath &&
        fileQuery.data.currentFileOrFolder
      ) {
        const imageUrl = getFileURL(
          fileBrowserState.uiFileSharePath.name,
          fileQuery.data.currentFileOrFolder.path
        );

        const zarrJsonFile = getFile('zarr.json');
        if (zarrJsonFile) {
          const attrs = (await fetchFileAsJson(
            fileBrowserState.uiFileSharePath.name,
            zarrJsonFile.path
          )) as any;
          if (signal.aborted) {
            return;
          }
          if (attrs.node_type === 'array') {
            await checkZarrArray(imageUrl, 3, signal);
          } else if (attrs.node_type === 'group') {
            if (attrs.attributes?.ome?.multiscales) {
              await checkOmeZarrMetadata(imageUrl, 3, signal);
            } else {
              log.info('Zarrv3 group has no multiscales', attrs.attributes);
            }
          } else {
            log.warn('Unknown Zarrv3 node type', attrs.node_type);
          }
        } else {
          const zarrayFile = getFile('.zarray');
          if (zarrayFile) {
            await checkZarrArray(imageUrl, 2, signal);
          } else {
            const zattrsFile = getFile('.zattrs');
            if (zattrsFile && fileBrowserState.uiFileSharePath) {
              const attrs = (await fetchFileAsJson(
                fileBrowserState.uiFileSharePath.name,
                zattrsFile.path
              )) as any;
              if (signal.aborted) {
                return;
              }
              if (attrs.multiscales) {
                await checkOmeZarrMetadata(imageUrl, 2, signal);
              }
            }
          }
        }
      }
    },
    [
      checkOmeZarrMetadata,
      checkZarrArray,
      fileQuery.isPending,
      fileQuery.data,
      fileBrowserState.uiFileSharePath,
      getFile
    ]
  );

  // When the file browser state changes, check for Zarr metadata
  React.useEffect(() => {
    const controller = new AbortController();
    checkZarrMetadata(controller.signal);
    return () => {
      controller.abort();
    };
  }, [checkZarrMetadata, fileQuery.isPending, fileQuery.data]);

  // When an OME-Zarr URL is set, load the thumbnail
  React.useEffect(() => {
    if (!omeZarrUrl) {
      return;
    }
    const controller = new AbortController();
    const loadThumbnail = async (signal: AbortSignal) => {
      try {
        const [thumbnail, error] = await getOmeZarrThumbnail(
          omeZarrUrl,
          signal
        );
        if (signal.aborted) {
          return;
        }
        setLoadingThumbnail(false);
        if (error) {
          log.error('Thumbnail load failed:', error);
          setThumbnailError(error);
        } else {
          setThumbnailSrc(thumbnail);
        }
      } catch (err) {
        if (!signal.aborted) {
          log.error('Unexpected error loading thumbnail:', err);
          setThumbnailError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    loadThumbnail(controller.signal);

    return () => {
      controller.abort();
    };
  }, [omeZarrUrl]);

  // Determine layer type when thumbnail becomes available
  React.useEffect(() => {
    if (!thumbnailSrc || disableHeuristicalLayerTypeDetection) {
      // Set default layer type if heuristics are disabled
      if (disableHeuristicalLayerTypeDetection) {
        setLayerType('image');
      }
      return;
    }

    const controller = new AbortController();

    const determineType = async (signal: AbortSignal) => {
      try {
        const determinedLayerType = await determineLayerType(
          !disableHeuristicalLayerTypeDetection,
          thumbnailSrc
        );
        if (signal.aborted) {
          return;
        }
        setLayerType(determinedLayerType);
      } catch (error) {
        if (!signal.aborted) {
          console.error('Error determining layer type:', error);
          setLayerType('image'); // Default fallback
        }
      }
    };

    determineType(controller.signal);

    return () => {
      controller.abort();
    };
  }, [thumbnailSrc, disableHeuristicalLayerTypeDetection]);

  // Run tool url generation when the proxied path url or metadata changes
  React.useEffect(() => {
    // Always create openWithToolUrls data structure when metadata is available
    if (metadata) {
      const url = externalDataUrl || proxiedPathByFspAndPathQuery.data?.url;
      const openWithToolUrls = {
        copy: url || ''
      } as OpenWithToolUrls;

      // Determine which tools should be available based on metadata type
      if (metadata?.multiscale) {
        // OME-Zarr - all urls for v2; no avivator for v3
        if (url) {
          // Populate with actual URLs when proxied path is available
          openWithToolUrls.validator = validatorBaseUrl + url;
          openWithToolUrls.vole = voleBaseUrl + url;
          openWithToolUrls.avivator =
            metadata.zarrVersion === 2 ? avivatorBaseUrl + url : null;
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
                  layerType || 'image',
                  metadata.multiscale,
                  metadata.arr,
                  metadata.omero,
                  useLegacyMultichannelApproach
                );
            } catch (error) {
              log.error(
                'Error generating Neuroglancer state for OME-Zarr:',
                error
              );
              openWithToolUrls.neuroglancer =
                neuroglancerBaseUrl + generateNeuroglancerStateForDataURL(url);
            }
          }
        } else {
          // No proxied URL - show all tools as available but empty
          openWithToolUrls.validator = '';
          openWithToolUrls.vole = '';
          // if this is a zarr version 2, then set the url to blank which will show
          // the icon before a data link has been generated. Setting it to null for
          // all other versions, eg zarr v3 means the icon will not be present before
          // a data link is generated.
          openWithToolUrls.avivator = metadata.zarrVersion === 2 ? '' : null;
          openWithToolUrls.neuroglancer = '';
        }
      } else {
        // Non-OME Zarr - only Neuroglancer available
        if (url) {
          openWithToolUrls.validator = null;
          openWithToolUrls.vole = null;
          openWithToolUrls.avivator = null;
          if (disableNeuroglancerStateGeneration) {
            openWithToolUrls.neuroglancer =
              neuroglancerBaseUrl + generateNeuroglancerStateForDataURL(url);
          } else {
            openWithToolUrls.neuroglancer =
              neuroglancerBaseUrl +
              generateNeuroglancerStateForZarrArray(
                url,
                metadata.zarrVersion,
                layerType || 'image'
              );
          }
        } else {
          // No proxied URL - only show Neuroglancer as available but empty
          openWithToolUrls.validator = null;
          openWithToolUrls.vole = null;
          openWithToolUrls.avivator = null;
          openWithToolUrls.neuroglancer = '';
        }
      }
      setOpenWithToolUrls(openWithToolUrls);
    } else {
      setOpenWithToolUrls(null);
    }
  }, [
    metadata,
    proxiedPathByFspAndPathQuery.data?.url,
    externalDataUrl,
    disableNeuroglancerStateGeneration,
    layerType,
    useLegacyMultichannelApproach
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
