import { useState, useCallback, useEffect } from 'react';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

// Hook to manage the open zones in the file browser sidebar
export default function useOpenZones() {
  const [openZones, setOpenZones] = useState<Record<string, boolean>>({
    all: true
  });

  const { fileBrowserState } = useFileBrowserContext();

  const toggleOpenZones = useCallback(
    (zone: string) => {
      setOpenZones(prev => ({
        ...prev,
        [zone]: !prev[zone]
      }));
    },
    [setOpenZones]
  );

  useEffect(() => {
    if (fileBrowserState.uiFileSharePath) {
      setOpenZones(prev => ({
        ...prev,
        [fileBrowserState.uiFileSharePath!.zone]: true
      }));
    }
  }, [fileBrowserState.uiFileSharePath]);

  return {
    openZones,
    setOpenZones,
    toggleOpenZones
  };
}
