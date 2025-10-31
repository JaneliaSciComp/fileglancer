import React from 'react';
import { default as log } from '@/logger';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useExternalBucketContext } from '@/contexts/ExternalBucketContext';
import {
  useZarrMetadataQuery,
  useOmeZarrThumbnailQuery
} from '@/queries/zarrQueries';
import type { OpenWithToolUrls, ZarrMetadata } from '@/queries/zarrQueries';
import type { FileOrFolder } from '@/shared.types';
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

export default function useZarrMetadata(
  fspName: string | undefined,
  currentFileOrFolder: FileOrFolder | undefined | null,
  files: FileOrFolder[] | undefined
) {
  const { proxiedPathByFspAndPathQuery } = useProxiedPathContext();
  const { externalDataUrl } = useExternalBucketContext();
  const {
    disableNeuroglancerStateGeneration,
    disableHeuristicalLayerTypeDetection,
    useLegacyMultichannelApproach
  } = usePreferencesContext();

  // Fetch Zarr metadata
  const zarrMetadataQuery = useZarrMetadataQuery({
    fspName,
    currentFileOrFolder,
    files
  });

  const metadata = zarrMetadataQuery.data?.metadata || null;
  const omeZarrUrl = zarrMetadataQuery.data?.omeZarrUrl || null;

  // Fetch thumbnail when OME-Zarr URL is available
  const thumbnailQuery = useOmeZarrThumbnailQuery(omeZarrUrl);
  const thumbnailSrc = thumbnailQuery.data?.thumbnailSrc || null;

  // Determine layer type from thumbnail (non-reactive, calculated once when thumbnail is ready)
  const [layerType, setLayerType] = React.useState<
    'auto' | 'image' | 'segmentation' | null
  >(null);

  React.useEffect(() => {
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

  // Compute tool URLs based on metadata and proxied path
  // Note: layerType is NOT in the dependency array to avoid recalculating URLs
  // when layer type is determined. We use a ref to track the effective layer type.
  const effectiveLayerTypeRef = React.useRef<'auto' | 'image' | 'segmentation'>(
    'image'
  );

  // Update the ref when layerType changes, but don't trigger re-render
  React.useEffect(() => {
    if (layerType) {
      effectiveLayerTypeRef.current = layerType;
    }
  }, [layerType]);

  const openWithToolUrls = React.useMemo(() => {
    if (!metadata) {
      return null;
    }

    const validatorBaseUrl =
      'https://ome.github.io/ome-ngff-validator/?source=';
    const neuroglancerBaseUrl = 'https://neuroglancer-demo.appspot.com/#!';
    const voleBaseUrl = 'https://volumeviewer.allencell.org/viewer?url=';
    const avivatorBaseUrl = 'https://janeliascicomp.github.io/viv/?image_url=';

    const url = externalDataUrl || proxiedPathByFspAndPathQuery.data?.url;
    const openWithToolUrls = {
      copy: url || ''
    } as OpenWithToolUrls;

    // Use the effective layer type from ref to avoid dependency on layerType state
    const currentLayerType = effectiveLayerTypeRef.current;

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
                currentLayerType,
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
              currentLayerType
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
    externalDataUrl,
    disableNeuroglancerStateGeneration,
    useLegacyMultichannelApproach
  ]);

  return {
    zarrMetadataQuery,
    thumbnailQuery,
    openWithToolUrls,
    layerType
  };
}
