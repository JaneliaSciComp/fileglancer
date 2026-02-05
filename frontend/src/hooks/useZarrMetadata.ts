import { useState, useMemo, useEffect } from 'react';
import { default as log } from '@/logger';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useExternalBucketContext } from '@/contexts/ExternalBucketContext';
import { useViewersContext } from '@/contexts/ViewersContext';
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
  const { fileQuery } = useFileBrowserContext();
  const { proxiedPathByFspAndPathQuery } = useProxiedPathContext();
  const { externalDataUrlQuery } = useExternalBucketContext();
  const {
    disableNeuroglancerStateGeneration,
    disableHeuristicalLayerTypeDetection,
    useLegacyMultichannelApproach
  } = usePreferencesContext();
  const {
    validViewers,
    isInitialized: viewersInitialized,
    getCompatibleViewers
  } = useViewersContext();

  // Fetch Zarr metadata
  const zarrMetadataQuery = useZarrMetadataQuery({
    fspName: fileQuery.data?.currentFileSharePath?.name,
    currentFileOrFolder: fileQuery.data?.currentFileOrFolder,
    files: fileQuery.data?.files
  });

  const effectiveZarrVersion =
    zarrMetadataQuery.data?.availableVersions.includes('v3') ? 3 : 2;

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
      // Set layer type to 'image' if no thumbnail or detection disabled
      setLayerType('image');
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

  const openWithToolUrls = useMemo(() => {
    if (!metadata || !viewersInitialized) {
      return null;
    }

    const url =
      externalDataUrlQuery.data || proxiedPathByFspAndPathQuery.data?.url;

    const openWithToolUrls = {
      copy: url || ''
    } as OpenWithToolUrls;

    // Get compatible viewers for this dataset
    let compatibleViewers = validViewers;

    // If we have multiscales metadata (OME-Zarr), use capability checking to filter
    if (metadata?.multiscale) {
      // Convert our metadata to OmeZarrMetadata format for capability checking
      const omeZarrMetadata = {
        version: effectiveZarrVersion === 3 ? '0.5' : '0.4',
        axes: metadata.multiscale?.axes,
        multiscales: metadata.multiscale ? [metadata.multiscale] : undefined,
        omero: metadata.omero,
        labels: metadata.labels
      } as any; // Type assertion needed due to internal type differences

      compatibleViewers = getCompatibleViewers(omeZarrMetadata);

      // Create a Set for lookup of compatible viewer keys
      // Needed to mark incompatible but valid (as defined by the viewer config) viewers as null in openWithToolUrls
      const compatibleKeys = new Set(compatibleViewers.map(v => v.key));

      for (const viewer of validViewers) {
        if (!compatibleKeys.has(viewer.key)) {
          openWithToolUrls[viewer.key] = null;
        }
      }

      // For compatible viewers, generate URLs
      for (const viewer of compatibleViewers) {
        if (!url) {
          // Compatible but no data URL yet - show as available (empty string)
          openWithToolUrls[viewer.key] = '';
          continue;
        }

        // Generate the viewer URL
        let viewerUrl = viewer.urlTemplate;

        // Special handling for Neuroglancer to maintain existing state generation logic
        if (viewer.key === 'neuroglancer') {
          // Extract base URL from template (everything before #!)
          const neuroglancerBaseUrl = viewer.urlTemplate.split('#!')[0] + '#!';
          if (disableNeuroglancerStateGeneration) {
            viewerUrl =
              neuroglancerBaseUrl +
              generateNeuroglancerStateForDataURL(url, effectiveZarrVersion);
          } else if (layerType) {
            try {
              viewerUrl =
                neuroglancerBaseUrl +
                generateNeuroglancerStateForOmeZarr(
                  url,
                  effectiveZarrVersion,
                  layerType,
                  metadata.multiscale,
                  metadata.arr,
                  metadata.labels,
                  metadata.omero,
                  useLegacyMultichannelApproach
                );
            } catch (error) {
              log.error(
                'Error generating Neuroglancer state for OME-Zarr:',
                error
              );
              viewerUrl =
                neuroglancerBaseUrl +
                generateNeuroglancerStateForDataURL(url, effectiveZarrVersion);
            }
          }
        } else {
          // For other viewers, replace {dataLink} placeholder if present
          if (viewerUrl.includes('{dataLink}')) {
            viewerUrl = viewerUrl.replace(
              /{dataLink}/g,
              encodeURIComponent(url)
            );
          } else {
            // If no placeholder, use buildUrl with 'url' query param
            viewerUrl = buildUrl(viewerUrl, null, { url });
          }
        }

        openWithToolUrls[viewer.key] = viewerUrl;
      }
    } else {
      // Non-OME Zarr - only Neuroglancer available
      // Mark all non-Neuroglancer viewers as incompatible
      for (const viewer of validViewers) {
        if (viewer.key !== 'neuroglancer') {
          openWithToolUrls[viewer.key] = null;
        } else {
          // Neuroglancer
          if (url) {
            // Extract base URL from template (everything before #!)
            const neuroglancerBaseUrl =
              viewer.urlTemplate.split('#!')[0] + '#!';
            if (disableNeuroglancerStateGeneration) {
              openWithToolUrls.neuroglancer =
                neuroglancerBaseUrl +
                generateNeuroglancerStateForDataURL(url, effectiveZarrVersion);
            } else if (layerType) {
              openWithToolUrls.neuroglancer =
                neuroglancerBaseUrl +
                generateNeuroglancerStateForZarrArray(
                  url,
                  effectiveZarrVersion,
                  layerType
                );
            } else {
              // layerType not yet determined - use fallback
              openWithToolUrls.neuroglancer =
                neuroglancerBaseUrl +
                generateNeuroglancerStateForDataURL(url, effectiveZarrVersion);
            }
          } else {
            // No proxied URL - show Neuroglancer as available but empty
            openWithToolUrls.neuroglancer = '';
          }
        }
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
    effectiveZarrVersion,
    validViewers,
    viewersInitialized,
    getCompatibleViewers
  ]);

  return {
    zarrMetadataQuery,
    thumbnailQuery,
    openWithToolUrls,
    layerType,
    availableVersions: zarrMetadataQuery.data?.availableVersions || []
  };
}
