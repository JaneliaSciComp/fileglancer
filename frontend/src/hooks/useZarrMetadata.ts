import { useState, useRef, useMemo, useEffect } from 'react';
import { default as log } from '@/logger';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useExternalBucketContext } from '@/contexts/ExternalBucketContext';
import {
  useZarrMetadataQuery,
  useOmeZarrThumbnailQuery
} from '@/queries/zarrQueries';
import type { OpenWithToolUrls, ZarrMetadata } from '@/queries/zarrQueries';
import {
  generateNeuroglancerStateForDataURL,
  generateNeuroglancerStateForZarrArray,
  generateNeuroglancerStateForOmeZarr,
  determineLayerType
} from '@/omezarr-helper';
import * as zarr from 'zarrita';

export type { OpenWithToolUrls, ZarrMetadata };
export type PendingToolKey = keyof OpenWithToolUrls | null;
export type ZarrArray = zarr.Array<any>;

export default function useZarrMetadata() {
  const { fileQuery, fileBrowserState } = useFileBrowserContext();
  const { proxiedPathByFspAndPathQuery } = useProxiedPathContext();
  const { externalDataUrlQuery } = useExternalBucketContext();
  const {
    disableNeuroglancerStateGeneration,
    disableHeuristicalLayerTypeDetection,
    useLegacyMultichannelApproach
  } = usePreferencesContext();

  // Fetch Zarr metadata
  const metadataQuery = useZarrMetadataQuery({
    fspName: fileBrowserState.uiFileSharePath?.name,
    currentFileOrFolder: fileQuery.data?.currentFileOrFolder,
    files: fileQuery.data?.files
  });

  const metadata = metadataQuery.data?.metadata || null;
  const omeZarrUrl = metadataQuery.data?.omeZarrUrl || null;

  // Fetch thumbnail when OME-Zarr URL is available
  const thumbnailQuery = useOmeZarrThumbnailQuery(omeZarrUrl);
  const thumbnailSrc = thumbnailQuery.data?.thumbnailSrc || null;
  const thumbnailError = thumbnailQuery.data?.thumbnailError || null;
  const loadingThumbnail = thumbnailQuery.isPending && !!omeZarrUrl;

  const [layerType, setLayerType] = useState<
    'auto' | 'image' | 'segmentation' | null
  >(null);

  useEffect(() => {
    if (disableHeuristicalLayerTypeDetection) {
      setLayerType('image');
      return;
    }

    if (!thumbnailSrc) {
      setLayerType(null);
      return;
    }

    let cancelled = false;
    determineLayerType(true, thumbnailSrc).then(result => {
      if (!cancelled) {
        setLayerType(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [thumbnailSrc, disableHeuristicalLayerTypeDetection]);

  const openWithToolUrls = useMemo(() => {
    if (!metadata) {
      return null;
    }
    const validatorBaseUrl =
      'https://ome.github.io/ome-ngff-validator/?source=';
    const neuroglancerBaseUrl = 'https://neuroglancer-demo.appspot.com/#!';
    const voleBaseUrl = 'https://volumeviewer.allencell.org/viewer?url=';
    const avivatorBaseUrl = 'https://janeliascicomp.github.io/viv/?image_url=';

    const url =
      externalDataUrlQuery.data || proxiedPathByFspAndPathQuery.data?.url;
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
        } else if (layerType) {
          try {
            openWithToolUrls.neuroglancer =
              neuroglancerBaseUrl +
              generateNeuroglancerStateForOmeZarr(
                url,
                metadata.zarrVersion,
                layerType,
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
        } else if (layerType) {
          openWithToolUrls.neuroglancer =
            neuroglancerBaseUrl +
            generateNeuroglancerStateForZarrArray(
              url,
              metadata.zarrVersion,
              layerType
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

    return openWithToolUrls;
  }, [
    metadata,
    proxiedPathByFspAndPathQuery.data?.url,
    externalDataUrlQuery.data,
    disableNeuroglancerStateGeneration,
    useLegacyMultichannelApproach,
    layerType
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
