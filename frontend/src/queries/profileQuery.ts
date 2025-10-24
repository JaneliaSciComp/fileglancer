import { useQuery } from '@tanstack/react-query';

import { sendFetchRequest } from '@/utils';
import type { Profile } from '@/shared.types';

export const useProfileQuery = () => {
  const fetchProfile = async (): Promise<Profile> => {
    const response = await sendFetchRequest('/api/profile', 'GET');
    return await response.json();
  };

  return useQuery<Profile, Error>({
    queryKey: ['profile'],
    queryFn: async () => fetchProfile()
  });
};
