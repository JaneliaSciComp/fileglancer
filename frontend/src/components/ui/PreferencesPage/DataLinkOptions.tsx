import toast from 'react-hot-toast';
import { Typography } from '@material-tailwind/react';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import OptionsSection from '@/components/ui/PreferencesPage/OptionsSection';

type DataLinkOptionsProps = {
  readonly checkboxesOnly?: boolean;
  readonly hideSubpathMode?: boolean;
};

const SUBPATH_MODES = [
  { value: 'name' as const, label: 'Directory name only' },
  { value: 'full_path' as const, label: 'Full path' },
  { value: 'custom' as const, label: 'Custom' }
];

export function SubpathModeOptions({
  indented = false
}: {
  readonly indented?: boolean;
}) {
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
    <div className={indented ? 'pl-4' : ''}>
      <Typography className={`text-foreground ${indented ? 'mt-2' : ''} mb-1`}>
        Link name format:
      </Typography>
      {SUBPATH_MODES.map(mode => (
        <div className="flex items-center gap-2" key={mode.value}>
          <input
            checked={dataLinkSubpathMode === mode.value}
            className="icon-small accent-secondary-light dark:accent-secondary"
            id={`subpath_mode_${mode.value}`}
            name="subpath_mode"
            onChange={() => handleSubpathModeChange(mode.value)}
            type="radio"
          />
          <Typography
            as="label"
            className="text-foreground"
            htmlFor={`subpath_mode_${mode.value}`}
          >
            {mode.label}
          </Typography>
        </div>
      ))}
    </div>
  );
}

export default function DataLinkOptions({
  checkboxesOnly = false,
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
      <OptionsSection
        checkboxesOnly={checkboxesOnly}
        header="Data Links"
        options={[automaticOption]}
      />
      {hideSubpathMode ? null : (
        <SubpathModeOptions indented={!checkboxesOnly} />
      )}
    </>
  );
}
