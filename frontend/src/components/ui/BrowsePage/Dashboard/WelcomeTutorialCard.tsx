import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import StartTour from '@/components/tours/StartTour';
import DashboardCard from '@/components/ui/BrowsePage/Dashboard/FgDashboardCard';
import FgSwitch from '@/components/designSystem/atoms/formElements/FgSwitch';

export default function WelcomeTutorialCard() {
  const { showTutorial, toggleShowTutorial } = usePreferencesContext();

  const handleToggle = async () => {
    const result = await toggleShowTutorial();
    if (result.success) {
      toast.success(
        'Welcome card hidden. Access Tutorials from the Help page.'
      );
    } else {
      toast.error(result.error);
    }
  };

  return (
    <DashboardCard title="Welcome to Fileglancer!">
      <div className="grid grid-cols-3 gap-6 p-6">
        <Typography className="text-foreground col-span-2">
          Fileglancer helps you browse, visualize, and share scientific imaging
          data. Get started with a guided tour to learn the basics!
        </Typography>

        <StartTour>Start Tour</StartTour>
      </div>

      <div className="flex pt-4 mx-6 border-t border-outline">
        <FgSwitch
          checked={showTutorial}
          id="hide_welcome_card"
          label="Show this card on startup"
          onChange={handleToggle}
          showState={true}
        />
      </div>
    </DashboardCard>
  );
}
