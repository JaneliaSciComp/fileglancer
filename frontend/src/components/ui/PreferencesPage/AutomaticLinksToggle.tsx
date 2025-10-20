import toast from 'react-hot-toast';
import { Typography } from '@material-tailwind/react';

import { usePreferencesContext } from '@/contexts/PreferencesContext';

export default function AutomaticLinksToggle() {
  const { areDataLinksAutomatic, toggleAutomaticDataLinks } =
    usePreferencesContext();
  return (
    <div className="flex items-center gap-2">
      <input
        checked={areDataLinksAutomatic}
        className="icon-small checked:accent-secondary-light"
        id="automatic_data_links"
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
        type="checkbox"
      />
      <Typography
        as="label"
        className="text-foreground"
        htmlFor="automatic_data_links"
      >
        Enable automatic data link creation
      </Typography>
    </div>
  );
}
