import { useState, useCallback, useEffect } from 'react';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

// Hook to manage the open zones in the file browser sidebar
export default function useOpenZones() {
  const [openZones, setOpenZones] = useState<Record<string, boolean>>({
    all: true
  });

  const toggleOpenZones = useCallback(
    (zone: string) => {
      setOpenZones(prev => ({
        ...prev,
        [zone]: !prev[zone]
      }));
    },
    [setOpenZones]
  );

  return {
    openZones,
    setOpenZones,
    toggleOpenZones
  };
}
