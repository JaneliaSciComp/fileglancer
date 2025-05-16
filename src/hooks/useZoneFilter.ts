import { useState } from 'react';
import { FileSharePaths } from './useFileBrowser';

export default function useZoneFilter() {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filteredFileSharePaths, setFilteredFileSharePaths] =
    useState<FileSharePaths>({});

  const handleSearchChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    fileSharePaths: FileSharePaths
  ): void => {
    const searchQuery = event.target.value;
    setSearchQuery(searchQuery);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const filteredPaths: FileSharePaths = {};

      Object.entries(fileSharePaths).forEach(([zone, paths]) => {
        const zoneMatches = zone.toLowerCase().includes(query);
        const matchingPaths = paths.filter(path =>
          path.toLowerCase().includes(query)
        );

        if (zoneMatches) {
          filteredPaths[zone] = paths;
        } else if (matchingPaths.length > 0) {
          filteredPaths[zone] = matchingPaths;
        }
      });

      setFilteredFileSharePaths(filteredPaths);
    } else {
      // When search query is empty, use all the original paths
      setFilteredFileSharePaths({});
    }
  };

  return { searchQuery, filteredFileSharePaths, handleSearchChange };
}
