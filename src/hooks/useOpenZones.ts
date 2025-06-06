import React from 'react';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

// Hook to manage the open zones in the file browser sidebar
export default function useOpenZones() {
  const [openZones, setOpenZones] = React.useState<Record<string, boolean>>({
    all: true
  });

  const { currentFileSharePath } = useFileBrowserContext();

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
    if (currentFileSharePath) {
      setOpenZones(prev => ({
        ...prev,
        [currentFileSharePath.zone]: true
      }));
    }
  }, [currentFileSharePath]);

  return {
    openZones,
    setOpenZones,
    toggleOpenZones
  };
}
