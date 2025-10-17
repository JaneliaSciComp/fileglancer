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
  const { zonesAndFileSharePathsMap } = useZoneAndFspMapContext();
  const navigate = useNavigate();

  // Update inputValue when initialValue changes
  React.useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const handleNavigationInputSubmit = (): Result<void> => {
    try {
      // Trim white space and, if necessary, convert backslashes to forward slashes
      const normalizedInput = convertBackToForwardSlash(inputValue.trim());

    // Collect all potential matches with their mount paths
    const potentialMatches: Array<{
      fspObject: FileSharePath;
      matchedPath: string;
      subpath: string;
    }> = [];

      const keys = Object.keys(zonesAndFileSharePathsMap);
      for (const key of keys) {
        // Iterate through only the objects in zonesAndFileSharePathsMap that have a key that start with "fsp_"
        if (key.startsWith('fsp_')) {
          const fspObject = zonesAndFileSharePathsMap[key] as FileSharePath;
          const linuxPath = fspObject.linux_path || '';
          const macPath = fspObject.mac_path || '';
          const windowsPath = convertBackToForwardSlash(fspObject.windows_path);

        let matchedPath: string | null = null;
        let subpath = '';
        // Check if the normalized input starts with any of the mount paths
        // If a match is found, extract the subpath
        // Collect all potential matches
        if (
          normalizedLinuxPath &&
          normalizedInput.includes(normalizedLinuxPath)
        ) {
          matchedPath = normalizedLinuxPath;
          subpath = normalizedInput.replace(normalizedLinuxPath, '').trim();
        } else if (
          normalizedMacPath &&
          normalizedInput.includes(normalizedMacPath)
        ) {
          matchedPath = normalizedMacPath;
          subpath = normalizedInput.replace(normalizedMacPath, '').trim();
        } else if (
          normalizedWindowsPath &&
          normalizedInput.includes(normalizedWindowsPath)
        ) {
          matchedPath = normalizedWindowsPath;
          subpath = normalizedInput.replace(normalizedWindowsPath, '').trim();
        }

        if (matchedPath) {
          potentialMatches.push({ fspObject, matchedPath, subpath });
        }
      }
    }

    // If we have matches, use the one with the longest matched path (most specific)
    if (potentialMatches.length > 0) {
      potentialMatches.sort(
        (a, b) => b.matchedPath.length - a.matchedPath.length
      );
      const bestMatch = potentialMatches[0];

      // The subpath is already in POSIX style from earlier normalization
      // Use makeBrowseLink to construct a properly escaped browse URL
      const browseLink = makeBrowseLink(
        bestMatch.fspObject.name,
        bestMatch.subpath
      );
      navigate(browseLink);
      // Clear the inputValue
      setInputValue('');
      return createSuccess(undefined);
    }

    return handleError(
      new Error('No matching file share path found for the input value.')
    );
  };

  return { inputValue, handleInputChange, handleNavigationInputSubmit };
}
