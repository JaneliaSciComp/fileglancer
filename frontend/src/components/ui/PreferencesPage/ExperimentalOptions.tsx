import toast from 'react-hot-toast';

import FgSwitch from '@/components/designSystem/atoms/formElements/FgSwitch';
import { usePreferencesContext } from '@/contexts/PreferencesContext';

export default function ExperimentalOptions() {
  const { showAppsAndJobsPages, toggleShowAppsAndJobsPages } =
    usePreferencesContext();

  return (
    <FgSwitch
      checked={showAppsAndJobsPages}
      id="show_apps_and_jobs_pages"
      label="Show Apps and Jobs pages"
      onChange={async () => {
        const result = await toggleShowAppsAndJobsPages();
        if (result.success) {
          toast.success(
            showAppsAndJobsPages
              ? 'Apps and Jobs pages are now hidden'
              : 'Apps and Jobs pages are now visible'
          );
        } else {
          toast.error(result.error);
        }
      }}
      showState
    />
  );
}
