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
