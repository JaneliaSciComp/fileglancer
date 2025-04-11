import React from 'react';

// Hook to manage the open zones in the file browser sidebar
export default function useToggleOpenZones() {
  const [openZones, setOpenZones] = React.useState<Record<string, boolean>>({});

  function toggleZone(zone: string) {
    setOpenZones(prev => ({
      ...prev,
      [zone]: !prev[zone]
    }));
  }
  return {
    openZones,
    toggleZone
  };
}
