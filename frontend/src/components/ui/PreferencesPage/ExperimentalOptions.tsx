import toast from 'react-hot-toast';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import OptionsSection from '@/components/ui/PreferencesPage/OptionsSection';

export default function ExperimentalOptions() {
  const { showAppsAndJobsPages, toggleShowAppsAndJobsPages } =
    usePreferencesContext();

  return (
    <OptionsSection
      header="Experimental Features"
      options={[
        {
          checked: showAppsAndJobsPages,
          id: 'show_apps_and_jobs_pages',
          label: 'Show Apps and Jobs pages',
          onChange: async () => {
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
          }
        }
      ]}
    />
  );
}
