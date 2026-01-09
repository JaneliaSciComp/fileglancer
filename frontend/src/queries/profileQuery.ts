import { useQuery, QueryFunctionContext } from '@tanstack/react-query';

import type { Profile } from '@/shared.types';
import { sendRequestAndThrowForNotOk } from './queryUtils';

export const useProfileQuery = () => {
  const fetchProfile = async ({
    signal
  }: QueryFunctionContext): Promise<Profile> => {
    const body = await sendRequestAndThrowForNotOk(
      '/api/profile',
      'GET',
      undefined,
      { signal }
    );
    return body as Profile;
  };

  return useQuery<Profile, Error>({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    staleTime: 5 * 60 * 1000 // 5 minutes - shouldn't change often
  });
};
