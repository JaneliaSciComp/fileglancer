import { useQuery, UseQueryResult } from '@tanstack/react-query';

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
    queryFn: async () => {
      if (!fspName) {
        throw new Error('No file share path selected');
      }

      const { content } = await fetchFileWithTextDetection(fspName, filePath);
      return content;
    },
    enabled: !!fspName,
    staleTime: 5 * 60 * 1000 // 5 minutes - same caching strategy as file lists
  });
}
