import { Button, Input, Typography } from '@material-tailwind/react';
import { HiChevronRight } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useEffect, useRef } from 'react';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import useNavigationInput from '@/hooks/useNavigationInput';

export default function NavigationInput({
  location,
  setShowNavigationDialog,
  initialValue = '',
  onDialogClose
}: {
  readonly location: 'dashboard' | 'dialog';
  readonly setShowNavigationDialog?: React.Dispatch<
    React.SetStateAction<boolean>
  >;
  readonly initialValue?: string;
  readonly onDialogClose?: () => void;
}) {
  const { inputValue, handleInputChange, handleNavigationInputSubmit } =
    useNavigationInput(initialValue);
  const { pathPreference } = usePreferencesContext();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (location === 'dialog' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [location]);

  const placeholderText =
    pathPreference[0] === 'windows_path'
      ? '\\\\prfs.hhmi.org\\path\\to\\folder'
      : pathPreference[0] === 'linux_path'
        ? '/path/to/folder'
        : 'smb://prfs.hhmi.org/path/to/folder';

  return (
    <div
      className={`flex w-full items-center ${location === 'dashboard' ? '' : 'gap-3 mt-8'}`}
    >
      <Typography
        as="label"
        className="font-semibold text-foreground mr-2 whitespace-nowrap"
        htmlFor="navigation-input-form"
      >
        Navigate:
      </Typography>
      <form
        className="flex items-center justify-center gap-2 bg-surface-light flex-1"
        id="navigation-input-form"
        onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const result = handleNavigationInputSubmit();
          if (!result.success) {
            toast.error(result.error);
          }
          if (setShowNavigationDialog) {
            setShowNavigationDialog(false);
          }
          if (onDialogClose) {
            onDialogClose();
          }
        }}
      >
        <Input
          className="bg-background text-lg"
          onChange={handleInputChange}
          placeholder={placeholderText}
          ref={inputRef}
          type="text"
          value={inputValue}
        />
        <Button className="max-h-full flex-1 gap-1" type="submit">
          Go
          <HiChevronRight className="icon-small stroke-2" />
        </Button>
      </form>
    </div>
  );
}
