import { useState, useMemo, useEffect } from 'react';
import { default as log } from '@/logger';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useExternalBucketContext } from '@/contexts/ExternalBucketContext';
import { useViewersContext } from '@/contexts/ViewersContext';
import {
  useZarrMetadataQuery,
  useOmeZarrThumbnailQuery,
  getEffectiveZarrStorageVersion
} from '@/queries/zarrQueries';
import type { OpenWithToolUrls, ZarrMetadata } from '@/queries/zarrQueries';
import {
  generateNeuroglancerStateForDataURL,
  generateNeuroglancerStateForZarrArray,
  generateNeuroglancerStateForOmeZarr,
  determineLayerType
} from '@/omezarr-helper';
import { buildUrl } from '@/utils';
import { resolveViewerTemplate } from '@/utils/viewerUrl';
import * as zarr from 'zarrita';

export type { OpenWithToolUrls, ZarrMetadata };
export type PendingToolKey = keyof OpenWithToolUrls | null;
export type ZarrArray = zarr.Array<any>;

export default function useZarrMetadata() {
  const { fileQuery } = useFileBrowserContext();
  const { currentDirProxiedPathQuery } = useProxiedPathContext();
  const { externalDataUrlQuery } = useExternalBucketContext();
  const {
    disableNeuroglancerStateGeneration,
    disableHeuristicalLayerTypeDetection,
    useLegacyMultichannelApproach,
    viewerUrlSources
  } = usePreferencesContext();
  const {
    validViewers,
    isInitialized: viewersInitialized,
    getViewerCompatibility
  } = useViewersContext();

  // Fetch Zarr metadata
  const zarrMetadataQuery = useZarrMetadataQuery({
    fspName: fileQuery.data?.currentFileSharePath?.name,
    currentFileOrFolder: fileQuery.data?.currentFileOrFolder,
    files: fileQuery.data?.files
  });

  const effectiveZarrVersion = getEffectiveZarrStorageVersion(
    zarrMetadataQuery.data?.availableZarrVersions ?? []
  );

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
          log.error('Error determining layer type:', error);
          setLayerType('image'); // Default fallback
        }
      }
    };

    determineType(controller.signal);

    return () => {
      controller.abort();
    };
  }, [thumbnailSrc, disableHeuristicalLayerTypeDetection]);

  const { openWithToolUrls, incompatibleViewers } = useMemo(() => {
    // Viewer key -> reasons the capability manifest rejected the dataset.
    const incompatibleViewers: Record<string, string[]> = {};
    if (!metadata || !viewersInitialized) {
      return { openWithToolUrls: null, incompatibleViewers };
    }

    const url =
      externalDataUrlQuery.data || currentDirProxiedPathQuery.data?.url;

    const openWithToolUrls = {
      copy: url || ''
    } as OpenWithToolUrls;

    // If we have multiscales metadata (OME-Zarr), use capability checking to
    // partition viewers. `metadata` is already an OmeZarrMetadata (plus
    // fileglancer's runtime handles), so it is passed straight to the
    // capability check.
    const primaryMultiscale = metadata.multiscales?.[0];
    if (primaryMultiscale) {
      const { compatible, incompatible } = getViewerCompatibility(metadata);
      for (const entry of incompatible) {
        incompatibleViewers[entry.viewer.key] = entry.reasons;
      }

      // Generate URLs for every configured viewer, including incompatible
      // ones: the manifest may be wrong, so the UI still offers them
      // (collapsed) and clicking must work.
      for (const viewer of [
        ...compatible,
        ...incompatible.map(entry => entry.viewer)
      ]) {
        if (!url) {
          // Compatible but no data URL yet - show as available (empty string)
          openWithToolUrls[viewer.key] = '';
          continue;
        }

        // Resolve the template based on the user's per-viewer URL preference
        const effectiveTemplate = resolveViewerTemplate(
          viewer,
          viewerUrlSources[viewer.key]
        );

        // Generate the viewer URL
        let viewerUrl = effectiveTemplate;

        // Special handling for Neuroglancer to maintain existing state generation logic
        if (viewer.key === 'neuroglancer') {
          // Extract base URL from template (everything before #!)
          const neuroglancerBaseUrl = effectiveTemplate.split('#!')[0] + '#!';
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
                  primaryMultiscale,
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
            // Resolve the template based on the user's per-viewer URL preference
            const effectiveTemplate = resolveViewerTemplate(
              viewer,
              viewerUrlSources[viewer.key]
            );
            // Extract base URL from template (everything before #!)
            const neuroglancerBaseUrl = effectiveTemplate.split('#!')[0] + '#!';
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
    return { openWithToolUrls, incompatibleViewers };
  }, [
    metadata,
    currentDirProxiedPathQuery.data?.url,
    externalDataUrlQuery.data,
    disableNeuroglancerStateGeneration,
    useLegacyMultichannelApproach,
    viewerUrlSources,
    layerType,
    effectiveZarrVersion,
    validViewers,
    viewersInitialized,
    getViewerCompatibility
  ]);

  return {
    zarrMetadataQuery,
    thumbnailQuery,
    openWithToolUrls,
    incompatibleViewers,
    layerType,
    availableZarrVersions: zarrMetadataQuery.data?.availableZarrVersions || []
  };
}
