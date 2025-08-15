import React from 'react';
import { useNavigate } from 'react-router';

import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { FileSharePath, Result } from '@/shared.types';
import { convertPathToPosixStyle, joinPaths } from '@/utils/pathHandling';
import { createSuccess, handleError } from '@/utils/errorHandling';

export default function useNavigationInput() {
  const [inputValue, setInputValue] = React.useState<string>('');
  const { zonesAndFileSharePathsMap } = useZoneAndFspMapContext();
  const navigate = useNavigate();

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const handleNavigationInputSubmit = (): Result<void> => {
    const keys = Object.keys(zonesAndFileSharePathsMap);
    for (const key of keys) {
      // Iterate through only the objects in zonesAndFileSharePathsMap that have a key that start with "fsp_"
      if (key.startsWith('fsp_')) {
        const parts = key.split('_');
        // further narrow down the search by checking if the inputValue contains the last part of the key
        if (inputValue.includes(parts[parts.length - 1])) {
          const fspObject = zonesAndFileSharePathsMap[key] as FileSharePath;
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
          // construct a relative path using the object.name and the normalized portion
          const relativePath = joinPaths(fspObject.name, subpath);
          // Use useNavigate to navigate to the constructed relative path
          navigate(`/browse/${relativePath}`);
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
