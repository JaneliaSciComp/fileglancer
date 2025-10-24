import React from 'react';
import { useNavigate } from 'react-router';

import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { FileSharePath, Result } from '@/shared.types';
import {
  convertBackToForwardSlash,
  makeBrowseLink
} from '@/utils/pathHandling';
import { createSuccess, handleError } from '@/utils/errorHandling';

export default function useNavigationInput(initialValue: string = '') {
  const [inputValue, setInputValue] = React.useState<string>(initialValue);
  const { zonesAndFspQuery } = useZoneAndFspMapContext();
  const navigate = useNavigate();

  // Update inputValue when initialValue changes
  React.useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
      // Trim white space and, if necessary, convert backslashes to forward slashes
      const normalizedInput = convertBackToForwardSlash(inputValue.trim());

      // Track best match
      let bestMatch: {
        fspObject: FileSharePath;
        matchedPath: string;
        subpath: string;
      } | null = null;

      const keys = Object.keys(zonesAndFspQuery.data);
      for (const key of keys) {
        // Iterate through only the objects in zonesAndFileSharePathsMap that have a key that start with "fsp_"
        if (key.startsWith('fsp_')) {
          const fspObject = zonesAndFspQuery.data[key] as FileSharePath;
          const linuxPath = fspObject.linux_path || '';
          const macPath = fspObject.mac_path || '';
          const windowsPath = convertBackToForwardSlash(fspObject.windows_path);

          let matchedPath: string | null = null;
          let subpath = '';
          // Check if the normalized input starts with any of the mount paths
          // If a match is found, extract the subpath
          // Collect all potential matches
          if (normalizedInput.startsWith(linuxPath)) {
            matchedPath = linuxPath;
            subpath = normalizedInput.replace(linuxPath, '');
          } else if (normalizedInput.startsWith(macPath)) {
            matchedPath = macPath;
            subpath = normalizedInput.replace(macPath, '');
          } else if (normalizedInput.startsWith(windowsPath)) {
            matchedPath = windowsPath;
            subpath = normalizedInput.replace(windowsPath, '');
          }

          if (matchedPath) {
            // The best match is the one with the longest matched path (most specific)
            if (
              !bestMatch ||
              matchedPath.length > bestMatch.matchedPath.length
            ) {
              bestMatch = {
                fspObject,
                matchedPath,
                subpath
              };
            }
          }
        }
      }

      if (bestMatch) {
        const browseLink = makeBrowseLink(
          bestMatch.fspObject.name,
          bestMatch.subpath
        );
        navigate(browseLink);
        // Clear the inputValue
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
