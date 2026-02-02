import { useMemo } from 'react';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useExternalBucketContext } from '@/contexts/ExternalBucketContext';
import { useN5MetadataQuery } from '@/queries/n5Queries';
import type { N5Metadata, N5OpenWithToolUrls } from '@/queries/n5Queries';

export type { N5Metadata, N5OpenWithToolUrls };

/**
 * Get the Neuroglancer source URL for N5 format
 */
function getNeuroglancerSourceN5(dataUrl: string): string {
  // Neuroglancer expects a trailing slash
  if (!dataUrl.endsWith('/')) {
    dataUrl = dataUrl + '/';
  }
  return dataUrl + '|n5:';
}

/**
 * Get the layer name for a given URL (same as Neuroglancer does it)
 */
function getLayerName(dataUrl: string): string {
  return dataUrl.split('/').filter(Boolean).pop() || 'Default';
}

/**
 * Generate a Neuroglancer state for N5 data
 */
function generateNeuroglancerStateForN5(dataUrl: string): string {
  const layer = {
    name: getLayerName(dataUrl),
    source: getNeuroglancerSourceN5(dataUrl),
    type: 'image' // Default to image for N5
  };

  const state = {
    layers: [layer],
    selectedLayer: {
      visible: true,
      layer: layer.name
    },
    layout: '4panel-alt'
  };

  return encodeURIComponent(JSON.stringify(state));
}

export default function useN5Metadata() {
  const { fileQuery } = useFileBrowserContext();
  const { proxiedPathByFspAndPathQuery } = useProxiedPathContext();
  const { externalDataUrlQuery } = useExternalBucketContext();

  // Fetch N5 metadata
  const n5MetadataQuery = useN5MetadataQuery({
    fspName: fileQuery.data?.currentFileSharePath?.name,
    currentFileOrFolder: fileQuery.data?.currentFileOrFolder,
    files: fileQuery.data?.files
  });

  const metadata = n5MetadataQuery.data || null;

  const openWithToolUrls = useMemo(() => {
    if (!metadata) {
      return null;
    }

    const neuroglancerBaseUrl = 'https://neuroglancer-demo.appspot.com/#!';

    const url =
      externalDataUrlQuery.data || proxiedPathByFspAndPathQuery.data?.url;

    const toolUrls: N5OpenWithToolUrls = {
      copy: url || '',
      neuroglancer: ''
    };

    if (url) {
      // Generate Neuroglancer URL with state
      toolUrls.neuroglancer =
        neuroglancerBaseUrl + generateNeuroglancerStateForN5(url);
    }

    return toolUrls;
  }, [
    metadata,
    proxiedPathByFspAndPathQuery.data?.url,
    externalDataUrlQuery.data
  ]);

  return {
    n5MetadataQuery,
    openWithToolUrls
  };
}
