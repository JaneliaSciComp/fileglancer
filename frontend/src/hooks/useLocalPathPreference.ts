import { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { usePreferencesContext } from '../contexts/PreferencesContext';

export default function useLocalPathPreference() {
  const { pathPreference } = usePreferencesContext();

  const [localPathPreference, setLocalPathPreference] =
    useState(pathPreference);

  const handleLocalChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (
      event.target.value === 'linux_path' ||
      event.target.value === 'mac_path' ||
      event.target.value === 'windows_path'
    ) {
      setLocalPathPreference([event.target.value]);
    }
  };

  // Update localPathPreference when pathPreference changes
  useEffect(() => {
    setLocalPathPreference(pathPreference);
  }, [pathPreference]);

  return {
    localPathPreference,
    handleLocalChange
  };
}
