import React from 'react';
import { usePreferencesContext } from '../contexts/PreferencesContext';

export default function useLocalPathPreference() {
  const { pathPreference } = usePreferencesContext();

  const [localPathPreference, setLocalPathPreference] =
    React.useState(pathPreference);

  const handleLocalChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (
      event.target.value === 'linux_path' ||
      event.target.value === 'mac_path' ||
      event.target.value === 'windows_path'
    ) {
      setLocalPathPreference([event.target.value]);
    }
  };

  // Update localPathPreference when pathPreference changes
  React.useEffect(() => {
    setLocalPathPreference(pathPreference);
  }, [pathPreference]);

  return {
    localPathPreference,
    handleLocalChange
  };
}
