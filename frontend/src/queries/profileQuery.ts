import { useQuery, QueryFunctionContext } from '@tanstack/react-query';

import { sendFetchRequest } from '@/utils';
import type { Profile } from '@/shared.types';

export const useProfileQuery = () => {
  const fetchProfile = async ({
    signal
  }: QueryFunctionContext): Promise<Profile> => {
    const response = await sendFetchRequest('/api/profile', 'GET', undefined, {
      signal
    });
    return await response.json();
  };

  return useQuery<Profile, Error>({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    staleTime: 5 * 60 * 1000 // 5 minutes - shouldn't change often
  });
};
