import { useQuery, QueryFunctionContext } from '@tanstack/react-query';

import { sendRequestAndThrowForNotOk } from './queryUtils';

interface VersionResponse {
  version: string;
}

export default function useVersionQuery() {
  const fetchVersion = async ({
    signal
  }: QueryFunctionContext): Promise<VersionResponse> => {
    const body = await sendRequestAndThrowForNotOk(
      '/api/version',
      'GET',
      undefined,
      {
        signal
      }
    );
    return body as VersionResponse;
  };

  return useQuery<VersionResponse, Error>({
    queryKey: ['version'],
    queryFn: fetchVersion,
    staleTime: 5 * 60 * 1000 // 5 minutes - version shouldn't change often
  });
}
