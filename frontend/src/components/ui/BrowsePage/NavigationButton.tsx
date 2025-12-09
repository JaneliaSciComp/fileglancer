import { IoNavigateCircleSharp } from 'react-icons/io5';

import DialogIconBtn from '@/components/ui/buttons/DialogIconBtn';
import NavigationInput from '@/components/ui/BrowsePage/NavigateInput';

type NavigationButtonProps = {
  readonly triggerClasses: string;
};

export default function NavigationButton({
  triggerClasses
}: NavigationButtonProps) {
  return (
    <DialogIconBtn
      icon={IoNavigateCircleSharp}
      label="Navigate to a path"
      triggerClasses={triggerClasses}
    >
      {closeDialog => (
        <NavigationInput
          location="dialog"
          setShowNavigationDialog={closeDialog}
        />
      )}
    </DialogIconBtn>
  );
}
