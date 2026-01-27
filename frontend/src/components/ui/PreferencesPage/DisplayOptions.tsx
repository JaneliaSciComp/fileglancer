import toast from 'react-hot-toast';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import OptionsSection from '@/components/ui/PreferencesPage/OptionsSection';

export default function DisplayOptions() {
  const {
    hideDotFiles,
    isFilteredByGroups,
    toggleHideDotFiles,
    toggleFilterByGroups,
    showTutorial,
    toggleShowTutorial
  } = usePreferencesContext();

  return (
    <OptionsSection
      header="Display"
      options={[
        {
          checked: isFilteredByGroups,
          id: 'is_filtered_by_groups',
          label: 'Display Zones for your groups only',
          onChange: async () => {
            const result = await toggleFilterByGroups();
            if (result.success) {
              toast.success(
                !isFilteredByGroups
                  ? 'Only Zones for groups you have membership in are now visible'
                  : 'All Zones are now visible'
              );
            } else {
              toast.error(result.error);
            }
          }
        },
        {
          checked: hideDotFiles,
          id: 'hide_dot_files',
          label: 'Hide dot files (files and folders starting with ".")',
          onChange: async () => {
            const result = await toggleHideDotFiles();
            if (result.success) {
              toast.success(
                hideDotFiles
                  ? 'Dot files are now visible'
                  : 'Dot files are now hidden'
              );
            } else {
              toast.error(result.error);
            }
          }
        },
        {
          checked: showTutorial,
          id: 'show_tutorial',
          label: 'Show tutorial welcome card on Browse page',
          onChange: async () => {
            const result = await toggleShowTutorial();
            if (result.success) {
              toast.success(
                showTutorial
                  ? 'Tutorial welcome card will no longer be shown on Browse page'
                  : 'Tutorial welcome card will be shown on Browse page'
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
