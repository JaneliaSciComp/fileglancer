import { useQuery, QueryFunctionContext } from '@tanstack/react-query';

import { sendFetchRequest } from '@/utils';

interface VersionResponse {
  version: string;
}

export default function useVersionQuery() {
  const fetchVersion = async ({
    signal
  }: QueryFunctionContext): Promise<VersionResponse> => {
    const response = await sendFetchRequest('/api/version', 'GET', undefined, {
      signal
    });
    return await response.json();
  };

  return useQuery<VersionResponse, Error>({
    queryKey: ['version'],
    queryFn: fetchVersion,
    staleTime: 5 * 60 * 1000 // 5 minutes - version shouldn't change often
  });
}
