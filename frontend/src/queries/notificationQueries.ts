import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { sendFetchRequest } from '@/utils';
import { FetchError } from './queryUtils';
import { usePageVisibility } from '@/hooks/usePageVisibility';

export type Notification = {
  id: number;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  active: boolean;
  created_at: string;
  expires_at?: string;
};

export const notificationQueryKeys = {
  all: ['notifications'] as const
};

export function useNotificationsQuery(): UseQueryResult<Notification[], Error> {
  const isPageVisible = usePageVisibility();

  return useQuery({
    queryKey: notificationQueryKeys.all,
    queryFn: async ({ signal }): Promise<Notification[]> => {
      const response = await sendFetchRequest('/api/notifications', 'GET', undefined, {
        signal
      });

      if (!response.ok) {
        throw new FetchError(response, 'Failed to fetch notifications');
      }

      const data = await response.json();
      return (data?.notifications as Notification[]) || [];
    },
    refetchInterval: 60000, // 60 seconds
    refetchIntervalInBackground: false, // Pause when page is hidden
    enabled: isPageVisible // Don't fetch at all when page hidden
  });
}
