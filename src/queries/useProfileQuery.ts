import { useQuery } from '@tanstack/react-query';

import { sendFetchRequest } from '@/utils';
import { useCookiesContext } from '@/contexts/CookiesContext';
import type { Profile } from '@/shared.types';

export const useProfileQuery = () => {
  const { cookies } = useCookiesContext();

  const fetchProfile = async (): Promise<Profile> => {
    const response = await sendFetchRequest(
      '/api/fileglancer/profile',
      'GET',
      cookies['_xsrf']
    );
    return response.json();
  };

  return useQuery<Profile, Error>({
    queryKey: ['profile'],
    queryFn: async () => fetchProfile()
  });
};
