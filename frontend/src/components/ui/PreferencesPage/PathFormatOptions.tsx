import toast from 'react-hot-toast';

import FgFieldSet from '@/components/designSystem/molecules/FgFieldSet';
import FgRadio from '@/components/designSystem/atoms/formElements/FgRadio';
import { usePreferencesContext } from '@/contexts/PreferencesContext';

const PATH_MODES = [
  { value: 'linux_path' as const, label: 'Cluster/Linux (e.g., /misc/public)' },
  {
    value: 'windows_path' as const,
    label: 'Windows/Linux SMB (e.g. \\\\prfs.hhmi.org\\public)'
  },
  {
    value: 'mac_path' as const,
    label: 'macOS (e.g. smb://prfs.hhmi.org/public)'
  }
];

export default function PathFormatOptions() {
  const { pathPreference, handlePathPreferenceSubmit } =
    usePreferencesContext();

  const handleChange = async (value: string) => {
    const result = await handlePathPreferenceSubmit([value]);
    if (result.success) {
      toast.success('Path preference updated successfully!');
    } else {
      toast.error(result.error);
    }
  };

  return (
    <FgFieldSet legend="File path format">
      {PATH_MODES.map(mode => (
        <FgRadio
          checked={pathPreference[0] === mode.value}
          color="primary"
          id={mode.value}
          key={mode.value}
          label={mode.label}
          name="path_preference"
          onChange={() => handleChange(mode.value)}
          value={mode.value}
        />
      ))}
    </FgFieldSet>
  );
}
