import toast from 'react-hot-toast';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import OptionsSection from '@/components/ui/PreferencesPage/OptionsSection';

type DataLinkOptionsProps = {
  readonly checkboxesOnly?: boolean;
};

export default function DataLinkOptions({
  checkboxesOnly = false
}: DataLinkOptionsProps) {
  const {
    areDataLinksAutomatic,
    toggleAutomaticDataLinks,
    transparentDataLinks,
    toggleTransparentDataLinks
  } = usePreferencesContext();

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

  const transparentOption = {
    checked: transparentDataLinks,
    id: 'transparent_data_links',
    label: 'Include full path in data links',
    onChange: async () => {
      const result = await toggleTransparentDataLinks();
      if (result.success) {
        toast.success(
          transparentDataLinks
            ? 'Disabled full path in data links'
            : 'Enabled full path in data links'
        );
      } else {
        toast.error(result.error);
      }
    }
  };

  return (
    <OptionsSection
      checkboxesOnly={checkboxesOnly}
      header="Data Links"
      options={[automaticOption, transparentOption]}
    />
  );
}
