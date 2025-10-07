import React from 'react';
import { useNavigate } from 'react-router';

import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { FileSharePath, Result } from '@/shared.types';
import { convertPathToPosixStyle, makeBrowseLink } from '@/utils/pathHandling';
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

    const keys = Object.keys(zonesAndFspQuery);
    for (const key of keys) {
      // Iterate through only the objects in zonesAndFspQuery that have a key that start with "fsp_"
      if (key.startsWith('fsp_')) {
        const parts = key.split('_');
        // further narrow down the search by checking if the inputValue contains the last part of the key
        if (inputValue.includes(parts[parts.length - 1])) {
          const fspObject = zonesAndFspQuery.data[key] as FileSharePath;
          // Check if the inputValue contains object.linux_path, object.mac_path, or object.windows_path,
          // and if it does, get the portion of the inputValue that does not match the mount path (i.e., get the subpath)
          const linuxPath = fspObject.linux_path;
          const macPath = fspObject.mac_path;
          const windowsPath = fspObject.windows_path;

          let subpath = '';
          if (linuxPath && inputValue.includes(linuxPath)) {
            subpath = inputValue.replace(linuxPath, '').trim();
          } else if (macPath && inputValue.includes(macPath)) {
            subpath = inputValue.replace(macPath, '').trim();
          } else if (windowsPath && inputValue.includes(windowsPath)) {
            subpath = inputValue.replace(windowsPath, '').trim();
          } else {
            continue; // Skip to the next key if no path matches
          }
          // normalize this portion to use POSIX/linux format
          subpath = convertPathToPosixStyle(subpath);
          // Use makeBrowseLink to construct a properly escaped browse URL
          const browseLink = makeBrowseLink(fspObject.name, subpath);
          navigate(browseLink);
          // Clear the inputValue
          setInputValue('');
          return createSuccess(undefined);
        }
      }
    }
    return handleError(
      new Error('No matching file share path found for the input value.')
    );
  };

  return { inputValue, handleInputChange, handleNavigationInputSubmit };
}
