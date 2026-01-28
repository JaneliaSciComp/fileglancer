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
import {
  getCompatibleViewers,
  type OmeZarrMetadata
} from '@bioimagetools/capability-manifest';

/**
 * Convert Fileglancer's internal Metadata to the library's OmeZarrMetadata format
 * Only converts if this is a valid OME-Zarr dataset (has version)
 */
function convertToOmeZarrMetadata(
  metadata: ZarrMetadata
): OmeZarrMetadata | null {
  if (!metadata?.multiscale) {
    return null;
  }

  // If version is null/undefined, this is not a proper OME-Zarr dataset
  // Return null to fall back to legacy logic
  const version = metadata.multiscale.version;
  if (!version) {
    return null;
  }

  // Convert axes from multiscale to the expected format, ensuring no null values
  const axes =
    metadata.multiscale.axes?.map((axis: any) => ({
      name: axis.name,
      type: axis.type ?? undefined,
      unit: axis.unit ?? undefined
    })) || [];

  // Build the OmeZarrMetadata object
  const omeZarrMetadata: OmeZarrMetadata = {
    version: version as '0.4' | '0.5',
    axes,
    multiscales: [
      {
        ...metadata.multiscale,
        version,
        axes
      }
    ]
  };

  // Add optional fields if they exist
  if (metadata.omero) {
    omeZarrMetadata.omero = metadata.omero;
  }

  if (metadata.labels && metadata.labels.length > 0) {
    omeZarrMetadata.labels = metadata.labels;
  }

  return omeZarrMetadata;
}

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

    // Convert metadata to OmeZarrMetadata format and get compatible viewers
    const omeZarrMetadata = convertToOmeZarrMetadata(metadata);
    let compatibleViewers: string[] = [];

    if (omeZarrMetadata) {
      try {
        compatibleViewers = getCompatibleViewers(omeZarrMetadata);
        log.debug('Compatible viewers from library:', compatibleViewers);
      } catch (error) {
        log.error('Error getting compatible viewers:', error);
        // Fall back to assuming it's OME-Zarr if we have multiscale
        compatibleViewers = metadata?.multiscale ? ['Neuroglancer'] : [];
      }
    }

    // Determine which tools should be available based on compatible viewers
    const isOmeZarr = omeZarrMetadata !== null;

    if (isOmeZarr) {
      // OME-Zarr dataset
      const hasNeuroglancer = compatibleViewers.includes('Neuroglancer');
      const hasAvivator =
        compatibleViewers.includes('Vizarr') ||
        compatibleViewers.includes('Avivator');

      if (url) {
        // Avivator/Vizarr - only for v2 and if compatible
        if (effectiveZarrVersion === 2 && hasAvivator) {
          openWithToolUrls.avivator = buildUrl(avivatorBaseUrl, null, {
            image_url: url
          });
        } else {
          openWithToolUrls.avivator = null;
        }

        // Validator - always available for OME-Zarr
        openWithToolUrls.validator = buildUrl(validatorBaseUrl, null, {
          source: url
        });

        // Vol-E - keep as-is for now (not in library)
        openWithToolUrls.vole = buildUrl(voleBaseUrl, null, {
          url
        });

        // Neuroglancer - if compatible
        if (hasNeuroglancer) {
          if (disableNeuroglancerStateGeneration) {
            openWithToolUrls.neuroglancer =
              neuroglancerBaseUrl +
              generateNeuroglancerStateForDataURL(url, effectiveZarrVersion);
          } else if (layerType && metadata.multiscale) {
            try {
              openWithToolUrls.neuroglancer =
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
              openWithToolUrls.neuroglancer =
                neuroglancerBaseUrl +
                generateNeuroglancerStateForDataURL(url, effectiveZarrVersion);
            }
          } else {
            openWithToolUrls.neuroglancer = '';
          }
        } else {
          openWithToolUrls.neuroglancer = '';
        }
      } else {
        // No proxied URL - show compatible tools as available but empty
        openWithToolUrls.validator = '';
        openWithToolUrls.vole = '';
        openWithToolUrls.avivator =
          effectiveZarrVersion === 2 && hasAvivator ? '' : null;
        openWithToolUrls.neuroglancer = hasNeuroglancer ? '' : '';
      }
    } else {
      // Non-OME Zarr - only Neuroglancer available
      if (url) {
        openWithToolUrls.validator = null;
        openWithToolUrls.vole = null;
        openWithToolUrls.avivator = null;
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
    layerType,
    effectiveZarrVersion
  ]);

  return {
    zarrMetadataQuery,
    thumbnailQuery,
    openWithToolUrls,
    layerType,
    availableVersions: zarrMetadataQuery.data?.availableVersions || []
  };
}
