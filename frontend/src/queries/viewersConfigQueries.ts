import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { sendFetchRequest } from '@/utils';
import { default as log } from '@/logger';
import {
  parseViewersConfig,
  type ViewerConfigEntry
} from '@/config/viewersConfig';

export const viewersConfigKeys = {
  all: ['viewersConfig'] as const
};

const fetchViewersConfig = async (): Promise<ViewerConfigEntry[]> => {
  // Try runtime config from the server first.
  try {
    const response = await sendFetchRequest('/api/viewers-config', 'GET');
    if (response.ok) {
      const configYaml = await response.text();
      const config = parseViewersConfig(configYaml);
      log.info('Using runtime viewers configuration from server');
      return config.viewers;
    } else if (response.status !== 404) {
      log.warn(
        `Unexpected status ${response.status} from /api/viewers-config, falling back to bundled config`
      );
    }
    // 404 means no runtime config — fall through to bundled default
  } catch {
    // Network error — fall through to bundled default
    log.info('Runtime viewers config not available, using bundled default');
  }

  // Fall back to build-time bundled config
  const module = await import('@/config/viewers.config.yaml?raw');
  const config = parseViewersConfig(module.default);
  return config.viewers;
};

export function useViewersConfigQuery(): UseQueryResult<
  ViewerConfigEntry[],
  Error
> {
  return useQuery<ViewerConfigEntry[], Error>({
    queryKey: viewersConfigKeys.all,
    queryFn: fetchViewersConfig,
    staleTime: Infinity, // Config won't change during a session
    retry: false // If both sources fail, don't retry
  });
}
