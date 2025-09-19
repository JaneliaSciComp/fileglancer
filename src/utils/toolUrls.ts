import { generateNeuroglancerStateForDataURL } from '@/omezarr-helper';
import type { OpenWithToolUrls } from '@/hooks/useZarrMetadata';

export const TOOL_BASE_URLS = {
  validator: 'https://ome.github.io/ome-ngff-validator/?source=',
  neuroglancer: 'https://neuroglancer-demo.appspot.com/#!',
  vole: 'https://volumeviewer.allencell.org/viewer?url=',
  avivator: 'https://avivator.gehlenborglab.org/?image_url='
} as const;

export function constructToolUrl(
  toolName: keyof OpenWithToolUrls,
  dataUrl: string
): string | null {
  if (toolName === 'copy') {
    return dataUrl;
  }

  switch (toolName) {
    case 'validator':
      return TOOL_BASE_URLS.validator + dataUrl;
    case 'vole':
      return TOOL_BASE_URLS.vole + dataUrl;
    case 'avivator':
      return TOOL_BASE_URLS.avivator + dataUrl;
    case 'neuroglancer':
      return (
        TOOL_BASE_URLS.neuroglancer +
        generateNeuroglancerStateForDataURL(dataUrl)
      );
    default:
      return null;
  }
}
