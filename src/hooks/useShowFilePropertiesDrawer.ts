import React from 'react';

// Hook to manage the visibility of the file properties drawer
export default function useShowFilePropertiesDrawer() {
  const [showFilePropertiesDrawer, setShowFilePropertiesDrawer] =
    React.useState<boolean>(false);

  return {
    showFilePropertiesDrawer,
    setShowFilePropertiesDrawer
  };
}
