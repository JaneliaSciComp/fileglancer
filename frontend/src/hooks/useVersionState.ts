import React from 'react';

import logger from '@/logger';
import { sendFetchRequest } from '@/utils';

export default function useVersionNo() {
  const [versionNo, setVersionNo] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function getVersionNo() {
      try {
        const response = await sendFetchRequest('/api/version', 'GET');
        if (response.ok) {
          const data = await response.json();
          setVersionNo(data.version);
        }
      } catch (error) {
        logger.error(`Error fetching FG version number: ${error}`);
      }
    }
    if (versionNo === null) {
      getVersionNo();
    }
  }, [versionNo]);

  return { versionNo };
}
