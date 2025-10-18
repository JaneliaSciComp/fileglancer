import React from 'react';
import { IoNavigateCircleSharp } from 'react-icons/io5';

import FgTooltip from '@/components/ui/widgets/FgTooltip';
import NavigationInput from '@/components/ui/BrowsePage/NavigateInput';
import FgDialog from '@/components/ui/Dialogs/FgDialog';

type NavigationButtonProps = {
  readonly triggerClasses: string;
};

export default function NavigationButton({
  triggerClasses
}: NavigationButtonProps): React.JSX.Element {
  const [showNavigationDialog, setShowNavigationDialog] = React.useState(false);

  return (
    <>
      <FgTooltip
        icon={IoNavigateCircleSharp}
        label="Navigate to a path"
        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
          setShowNavigationDialog(true);
          e.currentTarget.blur();
        }}
        triggerClasses={triggerClasses}
      />
      {showNavigationDialog ? (
        <FgDialog
          onClose={() => setShowNavigationDialog(false)}
          open={showNavigationDialog}
        >
          <NavigationInput
            location="dialog"
            setShowNavigationDialog={setShowNavigationDialog}
          />
        </FgDialog>
      ) : null}
    </>
  );
}
