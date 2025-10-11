import { useState, useEffect } from 'react';
import { toHttpError, getErrorString } from '@/utils/errorHandling';
import { sendFetchRequest } from '@/utils';
import { useCookiesContext } from '@/contexts/CookiesContext';
import logger from '@/logger';

interface CentralVersionData {
  version: string;
}

type CentralVersionState =
  | { status: 'loading'; version: 'unknown' }
  | { status: 'loaded'; version: string }
  | { status: 'not-configured'; version: 'unknown' }
  | { status: 'error'; version: 'unknown'; error: string };

interface UseCentralVersionReturn {
  centralVersionState: CentralVersionState;
}

export default function useCentralVersion(): UseCentralVersionReturn {
  const [centralVersionState, setState] = useState<CentralVersionState>({
    status: 'loading',
    version: 'unknown'
  });
  const { cookies } = useCookiesContext();

  useEffect(() => {
    const fetchCentralVersion = async () => {
      try {
        setState({ status: 'loading', version: 'unknown' });

        const response = await sendFetchRequest(
          '/api/central-version',
          'GET',
          cookies['_xsrf']
        );

        if (!response.ok) {
          if (response.status === 500) {
            const httpError = await toHttpError(response);
            if (httpError.message.includes('Central server not configured')) {
              setState({ status: 'not-configured', version: 'unknown' });
              return;
            }
          }
          throw await toHttpError(response);
        }

        const data: CentralVersionData = await response.json();
        setState({ status: 'loaded', version: data.version });
      } catch (err) {
        logger.warn('Failed to fetch central version:', err);
        setState({
          status: 'error',
          version: 'unknown',
          error: getErrorString(err)
        });
      }
    };

    fetchCentralVersion();
  }, [cookies]);

  return {
    centralVersionState
  };
}
