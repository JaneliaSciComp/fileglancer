import React from 'react';

import NavigationInput from '@/components/ui/widgets/NavigateInput';
import FgDialog from './FgDialog';

type NavigationDialogProps = {
  showNavigationDialog: boolean;
  setShowNavigationDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function NavigationDialog({
  showNavigationDialog,
  setShowNavigationDialog
}: NavigationDialogProps): JSX.Element {
  return (
    <FgDialog
      open={showNavigationDialog}
      onClose={() => setShowNavigationDialog(false)}
    >
      <NavigationInput
        location="dialog"
        setShowNavigationDialog={setShowNavigationDialog}
      />
    </FgDialog>
  );
}
