import { Button, Input, Typography } from '@material-tailwind/react';
import { HiChevronRight } from 'react-icons/hi';
import toast from 'react-hot-toast';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import useNavigationInput from '@/hooks/useNavigationInput';

export default function NavigationInput({
  location,
  setShowNavigationDialog
}: {
  location: 'dashboard' | 'dialog';
  setShowNavigationDialog?: React.Dispatch<React.SetStateAction<boolean>>;
}): JSX.Element {
  const { inputValue, handleInputChange, handleNavigationInputSubmit } =
    useNavigationInput();
  const { pathPreference } = usePreferencesContext();

  const placeholderText =
    pathPreference[0] === 'windows_path'
      ? '\\\\prfs.hhmi.org\\path\\to\\folder'
      : pathPreference[0] === 'linux_path'
        ? '/groups/path/to/folder'
        : 'smb://prfs.hhmi.org/path/to/folder';

  return (
    <div
      className={`flex flex-col ${location === 'dashboard' ? 'col-span-2 w-1/2 pr-3 gap-1 ' : 'w-full gap-3 mt-8'}`}
    >
      <Typography
        as="label"
        htmlFor="navigation-input-form"
        className="font-semibold"
      >
        Navigate to path
      </Typography>
      <form
        onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const result = handleNavigationInputSubmit();
          if (!result.success) {
            toast.error(result.error);
          }
          if (setShowNavigationDialog) {
            setShowNavigationDialog(false);
          }
        }}
        className="flex items-center justify-center gap-2 bg-background"
        id="navigation-input-form"
      >
        <Input
          value={inputValue}
          onChange={handleInputChange}
          type="text"
          placeholder={placeholderText}
        />
        <Button type="submit" className="max-h-full flex-1 gap-1">
          Go
          <HiChevronRight className="icon-small stroke-2" />
        </Button>
      </form>
    </div>
  );
}
