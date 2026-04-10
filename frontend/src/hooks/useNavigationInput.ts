import { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router';

import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import type { Result } from '@/shared.types';
import { makeBrowseLink, resolvePathToFsp } from '@/utils/pathHandling';
import { createSuccess, handleError } from '@/utils/errorHandling';

export default function useNavigationInput(initialValue: string = '') {
  const [inputValue, setInputValue] = useState<string>(initialValue);
  const { zonesAndFspQuery } = useZoneAndFspMapContext();
  const navigate = useNavigate();

  // Update inputValue when initialValue changes
  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const handleNavigationInputSubmit = (): Result<void> => {
    if (zonesAndFspQuery.isError) {
      return handleError(
        new Error(
          `Cannot navigate: error loading zones and file share paths: ${zonesAndFspQuery.error.message}`
        )
      );
    }
    if (zonesAndFspQuery.isPending) {
      return handleError(
        new Error(
          'Cannot navigate: zones and file share paths are still loading.'
        )
      );
    }

    try {
      const resolved = resolvePathToFsp(inputValue, zonesAndFspQuery.data);

      if (resolved) {
        const browseLink = makeBrowseLink(resolved.fsp.name, resolved.subpath);
        navigate(browseLink);
        setInputValue('');
        return createSuccess(undefined);
      } else {
        throw new Error('No matching mount path found for the provided input.');
      }
    } catch (error) {
      return handleError(error);
    }
  };

  return { inputValue, handleInputChange, handleNavigationInputSubmit };
}
