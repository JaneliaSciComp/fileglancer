import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import { getFileURL } from '@/utils';
import { fetchPrecomputedInfo } from '@/utils/precomputed';
import type { PrecomputedInfo } from '@/utils/precomputed';
import type { FileOrFolder } from '@/shared.types';

/** A Neuroglancer precomputed dataset is a directory with an `info` file. */
export function hasPrecomputedInfoFile(files: FileOrFolder[]): boolean {
  return files.some(f => f.name === 'info' && !f.is_dir);
}

/**
 * The precomputed metadata of the current directory, or null when its `info`
 * file is something else: any file can be named `info`, so that is not an
 * error.
 */
export function usePrecomputedInfoQuery(
  fspName: string | undefined,
  currentFileOrFolder: FileOrFolder | undefined | null,
  files: FileOrFolder[] | undefined
): UseQueryResult<PrecomputedInfo | null, Error> {
  return useQuery({
    queryKey: [
      'precomputed',
      'info',
      fspName || '',
      currentFileOrFolder?.path || ''
    ],
    queryFn: () =>
      fetchPrecomputedInfo(
        getFileURL(fspName!, currentFileOrFolder!.path)
      ).catch(() => null),
    enabled:
      !!fspName &&
      !!currentFileOrFolder &&
      !!files &&
      hasPrecomputedInfoFile(files),
    staleTime: 5 * 60 * 1000,
    retry: false
  });
}
