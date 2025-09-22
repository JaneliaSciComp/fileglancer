import { useState, useEffect } from 'react';
import { toHttpError, getErrorString } from '@/utils/errorHandling';

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

  useEffect(() => {
    const fetchCentralVersion = async () => {
      try {
        setState({ status: 'loading', version: 'unknown' });

        const response = await fetch('/api/fileglancer/central-version');

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
        console.warn('Failed to fetch central version:', err);
        setState({
          status: 'error',
          version: 'unknown',
          error: getErrorString(err)
        });
      }
    };

    fetchCentralVersion();
  }, []);

  return {
    centralVersionState
  };
}
