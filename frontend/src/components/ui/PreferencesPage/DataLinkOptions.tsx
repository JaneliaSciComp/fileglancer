import toast from 'react-hot-toast';

import FgRadio from '@/components/designSystem/atoms/formElements/FgRadio';
import FgSwitch from '@/components/designSystem/atoms/formElements/FgSwitch';
import FgFieldSet from '@/components/designSystem/molecules/FgFieldSet';
import { usePreferencesContext } from '@/contexts/PreferencesContext';

type DataLinkOptionsProps = {
  readonly hideSubpathMode?: boolean;
};

const SUBPATH_MODES = [
  { value: 'name' as const, label: 'Directory name only' },
  { value: 'full_path' as const, label: 'Full path' },
  { value: 'custom' as const, label: 'Custom' }
];

export function SubpathModeOptions() {
  const { dataLinkSubpathMode, setDataLinkSubpathMode } =
    usePreferencesContext();

  const handleSubpathModeChange = async (
    mode: 'name' | 'full_path' | 'custom'
  ) => {
    const result = await setDataLinkSubpathMode(mode);
    if (result.success) {
      const label = SUBPATH_MODES.find(m => m.value === mode)?.label;
      toast.success(`Link name format set to: ${label}`);
    } else {
      toast.error(result.error);
    }
  };

  return (
    <FgFieldSet legend="Link name format">
      {SUBPATH_MODES.map(mode => (
        <FgRadio
          checked={dataLinkSubpathMode === mode.value}
          color="primary"
          id={`subpath_mode_${mode.value}`}
          key={mode.value}
          label={mode.label}
          name="subpath_mode"
          onChange={() => handleSubpathModeChange(mode.value)}
          value={mode.value}
        />
      ))}
    </FgFieldSet>
  );
}

export default function DataLinkOptions({
  hideSubpathMode = false
}: DataLinkOptionsProps) {
  const { areDataLinksAutomatic, toggleAutomaticDataLinks } =
    usePreferencesContext();

  const automaticOption = {
    checked: areDataLinksAutomatic,
    id: 'automatic_data_links',
    label: 'Enable automatic data link creation',
    onChange: async () => {
      const result = await toggleAutomaticDataLinks();
      if (result.success) {
        toast.success(
          areDataLinksAutomatic
            ? 'Disabled automatic data links'
            : 'Enabled automatic data links'
        );
      } else {
        toast.error(result.error);
      }
    }
  };

  return (
    <>
      <FgSwitch
        checked={automaticOption.checked}
        id={automaticOption.id}
        label={automaticOption.label}
        onChange={automaticOption.onChange}
        showState
      />
      {hideSubpathMode ? null : <SubpathModeOptions />}
    </>
  );
}
