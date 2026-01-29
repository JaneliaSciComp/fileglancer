import toast from 'react-hot-toast';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import OptionsSection from '@/components/ui/PreferencesPage/OptionsSection';

type AutomaticLinksToggleProps = {
  readonly checkboxesOnly?: boolean;
};

export default function AutomaticLinksToggle({
  checkboxesOnly = false
}: AutomaticLinksToggleProps) {
  const { areDataLinksAutomatic, toggleAutomaticDataLinks } =
    usePreferencesContext();

  return (
    <OptionsSection
      checkboxesOnly={checkboxesOnly}
      header="Data Links"
      options={[
        {
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
        }
      ]}
    />
  );
}
