import toast from 'react-hot-toast';
import { Typography } from '@material-tailwind/react';

import { usePreferencesContext } from '@/contexts/PreferencesContext';

export default function AutomaticLinksToggle() {
  const { areDataLinksAutomatic, toggleAutomaticDataLinks } =
    usePreferencesContext();
  return (
    <div className="flex items-center gap-2">
      <input
        className="icon-small checked:accent-secondary-light"
        type="checkbox"
        id="automatic_data_links"
        checked={areDataLinksAutomatic}
        onChange={async () => {
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
        }}
      />
      <Typography
        as="label"
        htmlFor="automatic_data_links"
        className="text-foreground"
      >
        Enable automatic data link creation
      </Typography>
    </div>
  );
}
