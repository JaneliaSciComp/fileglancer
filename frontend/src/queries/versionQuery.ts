import { useQuery } from '@tanstack/react-query';

import { sendFetchRequest } from '@/utils';

interface VersionResponse {
  version: string;
}

export default function useVersionQuery() {
  const fetchVersion = async (): Promise<VersionResponse> => {
    const response = await sendFetchRequest('/api/version', 'GET');
    return await response.json();
  };

  return useQuery<VersionResponse, Error>({
    queryKey: ['version'],
    queryFn: async () => fetchVersion(),
    staleTime: 5 * 60 * 1000 // 5 minutes - version shouldn't change often
  });
}
