import toast from 'react-hot-toast';
import { Typography } from '@material-tailwind/react';

import { usePreferencesContext } from '@/contexts/PreferencesContext';

export default function LegacyMultichannelToggle() {
  const { useLegacyMultichannelApproach, toggleUseLegacyMultichannelApproach } =
    usePreferencesContext();
  return (
    <div className="flex items-center gap-2">
      <input
        checked={useLegacyMultichannelApproach ?? false}
        className="icon-small checked:accent-secondary-light"
        id="use_legacy_multichannel_approach"
        onChange={async () => {
          const result = await toggleUseLegacyMultichannelApproach();
          if (result.success) {
            toast.success(
              useLegacyMultichannelApproach
                ? 'Disabled legacy multichannel approach for Neuroglancer'
                : 'Enabled legacy multichannel approach for Neuroglancer'
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
        htmlFor="use_legacy_multichannel_approach"
      >
        Use legacy multichannel approach for Neuroglancer
      </Typography>
    </div>
  );
}
