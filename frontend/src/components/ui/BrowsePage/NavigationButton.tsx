import { useState } from 'react';
import type { MouseEvent } from 'react';
import { IoNavigateCircleSharp } from 'react-icons/io5';

import FgTooltip from '@/components/ui/widgets/FgTooltip';
import NavigationInput from '@/components/ui/BrowsePage/NavigateInput';
import FgDialog from '@/components/ui/Dialogs/FgDialog';
import { IconButton } from '@material-tailwind/react';

type NavigationButtonProps = {
  readonly triggerClasses: string;
};

export default function NavigationButton({
  triggerClasses
}: NavigationButtonProps) {
  const [showNavigationDialog, setShowNavigationDialog] = useState(false);

  return (
    <>
      <FgTooltip
        as={IconButton}
        icon={IoNavigateCircleSharp}
        label="Navigate to a path"
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
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
