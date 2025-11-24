import {
  useQuery,
  UseQueryResult,
  QueryFunctionContext
} from '@tanstack/react-query';

import { fetchFileWithTextDetection } from '@/utils';

// Query keys for file content (flat structure - only invalidate specific files)
export const fileContentQueryKeys = {
  detail: (fspName: string, filePath: string) =>
    ['fileContent', fspName, filePath] as const
};

function isLikelyTextFile(buffer: ArrayBuffer | Uint8Array): boolean {
  const view = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;

  let controlCount = 0;
  for (const b of view) {
    if (b < 9 || (b > 13 && b < 32)) {
      controlCount++;
    }
  }

  return controlCount / view.length < 0.01;
}

async function fetchFileWithTextDetection(
  fspName: string,
  path: string,
  options?: FetchRequestOptions
): Promise<{ isText: boolean; content: string; rawData: Uint8Array }> {
  const rawData = await fetchFileContent(fspName, path, options);
  const isText = isLikelyTextFile(rawData);

  let content: string;
  if (isText) {
    content = new TextDecoder('utf-8', { fatal: false }).decode(rawData);
  } else {
    content = 'Binary file';
  }

  return { isText, content, rawData };
}

export function useFileContentQuery(
  fspName: string | undefined,
  filePath: string
): UseQueryResult<string, Error> {
  return useQuery<string, Error>({
    queryKey: fileContentQueryKeys.detail(fspName || '', filePath),
    queryFn: async ({ signal }: QueryFunctionContext) => {
      const { content } = await fetchFileWithTextDetection(fspName!, filePath, {
        signal
      });
      return content;
    },
    enabled: !!fspName && !!filePath
  });
}
