import { useState, useMemo, useEffect } from 'react';
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
import { buildUrl } from '@/utils';
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
  const zarrMetadataQuery = useZarrMetadataQuery({
    fspName: fileBrowserState.uiFileSharePath?.name,
    currentFileOrFolder: fileQuery.data?.currentFileOrFolder,
    files: fileQuery.data?.files
  });

  const metadata = zarrMetadataQuery.data?.metadata || null;
  const omeZarrUrl = zarrMetadataQuery.data?.omeZarrUrl || null;

  // Fetch thumbnail when OME-Zarr URL is available
  const thumbnailQuery = useOmeZarrThumbnailQuery(omeZarrUrl);
  const thumbnailSrc = thumbnailQuery.data || null;

  const [layerType, setLayerType] = useState<
    'auto' | 'image' | 'segmentation' | null
  >(null);

  useEffect(() => {
    if (!thumbnailSrc || disableHeuristicalLayerTypeDetection) {
      // Default layer type
      setLayerType('image');
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
    const validatorBaseUrl = 'https://ome.github.io/ome-ngff-validator/';
    const neuroglancerBaseUrl = 'https://neuroglancer-demo.appspot.com/#!';
    const voleBaseUrl = 'https://volumeviewer.allencell.org/viewer';
    const avivatorBaseUrl = 'https://janeliascicomp.github.io/viv/';

    const url =
      externalDataUrlQuery.data || proxiedPathByFspAndPathQuery.data?.url;
    const openWithToolUrls = {
      copy: url || ''
    } as OpenWithToolUrls;

    function addDualNeuroglancerDataUrls(
      baseUrl: string,
      dataUrl: string,
      openWithToolUrls: OpenWithToolUrls
    ) {
      if (zarrMetadataQuery.data?.availableVersions.includes('v2')) {
        openWithToolUrls.neuroglancerV2 =
          baseUrl + generateNeuroglancerStateForDataURL(dataUrl, 2);
      }
      if (zarrMetadataQuery.data?.availableVersions.includes('v3')) {
        openWithToolUrls.neuroglancerV3 =
          baseUrl + generateNeuroglancerStateForDataURL(dataUrl, 3);
      }
    }

    // Determine which tools should be available based on metadata type
    if (metadata?.multiscale) {
      // OME-Zarr - all urls for v2; no avivator for v3
      if (url) {
        // Populate with actual URLs when proxied path is available
        openWithToolUrls.validator = buildUrl(validatorBaseUrl, null, {
          source: url
        });
        openWithToolUrls.vole = buildUrl(voleBaseUrl, null, {
          url
        });
        // Avivator is only available for Zarr v2
        openWithToolUrls.avivator =
          zarrMetadataQuery.data?.availableVersions.includes('v2')
            ? buildUrl(avivatorBaseUrl, null, { image_url: url })
            : null;
        if (disableNeuroglancerStateGeneration) {
          addDualNeuroglancerDataUrls(
            neuroglancerBaseUrl,
            url,
            openWithToolUrls
          );
        } else if (layerType) {
          try {
            if (zarrMetadataQuery.data?.availableVersions.includes('v2')) {
              openWithToolUrls.neuroglancerV2 =
                neuroglancerBaseUrl +
                generateNeuroglancerStateForOmeZarr(
                  url,
                  2,
                  layerType,
                  metadata.multiscale,
                  metadata.arr,
                  metadata.omero,
                  useLegacyMultichannelApproach
                );
            }
            if (zarrMetadataQuery.data?.availableVersions.includes('v3')) {
              openWithToolUrls.neuroglancerV3 =
                neuroglancerBaseUrl +
                generateNeuroglancerStateForOmeZarr(
                  url,
                  3,
                  layerType,
                  metadata.multiscale,
                  metadata.arr,
                  metadata.omero,
                  useLegacyMultichannelApproach
                );
            }
          } catch (error) {
            log.error(
              'Error generating Neuroglancer state for OME-Zarr:',
              error
            );
            addDualNeuroglancerDataUrls(
              neuroglancerBaseUrl,
              url,
              openWithToolUrls
            );
          }
        } else {
          // layerType not yet determined - leave empty (skeleton will show)
          if (zarrMetadataQuery.data?.availableVersions.includes('v2')) {
            openWithToolUrls.neuroglancerV2 = '';
          }
          if (zarrMetadataQuery.data?.availableVersions.includes('v3')) {
            openWithToolUrls.neuroglancerV3 = '';
          }
        }
      } else {
        // No proxied URL - show all tools as available but empty
        openWithToolUrls.validator = '';
        openWithToolUrls.vole = '';
        // Avivator is only available for Zarr v2. Show empty string for loading if v2 available,
        // otherwise null to hide the icon entirely
        openWithToolUrls.avivator =
          zarrMetadataQuery.data?.availableVersions.includes('v2') ? '' : null;
        openWithToolUrls.neuroglancerV2 = '';
        openWithToolUrls.neuroglancerV3 = '';
      }
    } else {
      // Non-OME Zarr - only Neuroglancer available
      if (url) {
        openWithToolUrls.validator = null;
        openWithToolUrls.vole = null;
        openWithToolUrls.avivator = null;
        if (disableNeuroglancerStateGeneration) {
          addDualNeuroglancerDataUrls(
            neuroglancerBaseUrl,
            url,
            openWithToolUrls
          );
        } else if (layerType) {
          if (zarrMetadataQuery.data?.availableVersions.includes('v2')) {
            openWithToolUrls.neuroglancerV2 =
              neuroglancerBaseUrl +
              generateNeuroglancerStateForZarrArray(url, 2, layerType);
          }
          if (zarrMetadataQuery.data?.availableVersions.includes('v3')) {
            openWithToolUrls.neuroglancerV3 =
              neuroglancerBaseUrl +
              generateNeuroglancerStateForZarrArray(url, 3, layerType);
          }
        } else {
          // layerType not yet determined - leave empty (skeleton will show)
          if (zarrMetadataQuery.data?.availableVersions.includes('v2')) {
            openWithToolUrls.neuroglancerV2 = '';
          }
          if (zarrMetadataQuery.data?.availableVersions.includes('v3')) {
            openWithToolUrls.neuroglancerV3 = '';
          }
        }
      } else {
        // No proxied URL - only show Neuroglancer as available but empty
        openWithToolUrls.validator = null;
        openWithToolUrls.vole = null;
        openWithToolUrls.avivator = null;
        openWithToolUrls.neuroglancerV2 = '';
        openWithToolUrls.neuroglancerV3 = '';
      }
    }

    return openWithToolUrls;
  }, [
    metadata,
    proxiedPathByFspAndPathQuery.data?.url,
    externalDataUrlQuery.data,
    disableNeuroglancerStateGeneration,
    useLegacyMultichannelApproach,
    layerType,
    zarrMetadataQuery.data?.availableVersions
  ]);

  return {
    availableVersions: zarrMetadataQuery.data?.availableVersions ?? [],
    layerType,
    openWithToolUrls,
    thumbnailQuery,
    zarrMetadataQuery
  };
}
