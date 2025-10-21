import React from 'react';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

// Hook to manage the open zones in the file browser sidebar
export default function useOpenZones() {
  const [openZones, setOpenZones] = React.useState<Record<string, boolean>>({
    all: true
  });

  const { fileQuery } = useFileBrowserContext();

  const toggleOpenZones = React.useCallback(
    (zone: string) => {
      setOpenZones(prev => ({
        ...prev,
        [zone]: !prev[zone]
      }));
    },
    [setOpenZones]
  );

  React.useEffect(() => {
    if (fileQuery.data.currentFileSharePath) {
      setOpenZones(prev => ({
        ...prev,
        [fileQuery.data.currentFileSharePath!.zone]: true
      }));
    }
  }, [fileQuery.data.currentFileSharePath]);

  return {
    openZones,
    setOpenZones,
    toggleOpenZones
  };
}
