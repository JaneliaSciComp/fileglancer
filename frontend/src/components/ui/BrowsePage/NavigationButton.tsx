import { IoNavigateCircleSharp } from 'react-icons/io5';

import ContainedDialogBtn from '@/components/ui/buttons/ContainedDialogBtn';
import NavigationInput from '@/components/ui/BrowsePage/NavigateInput';

type NavigationButtonProps = {
  readonly triggerClasses: string;
};

export default function NavigationButton({
  triggerClasses
}: NavigationButtonProps) {
  return (
    <ContainedDialogBtn
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
    </ContainedDialogBtn>
  );
}
