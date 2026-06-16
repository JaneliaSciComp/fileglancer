import type { ChangeEvent } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgDialog from './FgDialog';
import TextWithFilePath from './TextWithFilePath';
import useConvertFileDialog from '@/hooks/useConvertFileDialog';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useTicketContext } from '@/contexts/TicketsContext';
import { getPreferredPathForDisplay } from '@/utils/pathHandling';
import FileSelectorButton from '@/components/ui/FileSelector/FileSelectorButton';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgFormField from '@/components/designSystem/molecules/FgFormField';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';

type ItemNamingDialogProps = {
  readonly showConvertFileDialog: boolean;
  readonly setShowConvertFileDialog: React.Dispatch<
    React.SetStateAction<boolean>
  >;
};

const tasksEnabled = import.meta.env.VITE_ENABLE_TASKS === 'true';

export default function ConvertFileDialog({
  showConvertFileDialog,
  setShowConvertFileDialog
}: ItemNamingDialogProps) {
  const {
    destinationFolder,
    setDestinationFolder,
    outputFilename,
    setOutputFilename,
    handleTicketSubmit,
    destinationValidation,
    filenameValidation
  } = useConvertFileDialog();
  const { pathPreference } = usePreferencesContext();
  const { fileQuery, fileBrowserState, fspName, filePath } =
    useFileBrowserContext();
  const { allTicketsQuery, createTicketMutation } = useTicketContext();

  const placeholderText =
    pathPreference[0] === 'windows_path'
      ? '\\path\\to\\destination\\folder\\'
      : '/path/to/destination/folder/';

  const displayPath = fileQuery.data?.currentFileSharePath
    ? getPreferredPathForDisplay(
        pathPreference,
        fileQuery.data.currentFileSharePath,
        fileBrowserState.propertiesTarget?.path
      )
    : '';

  // Use current browser location as initial location for FileSelector
  const initialLocation =
    fspName && filePath
      ? {
          fspName,
          path: filePath
        }
      : undefined;

  return (
    <FgDialog
      onClose={() => setShowConvertFileDialog(false)}
      open={showConvertFileDialog}
    >
      <Typography
        className="mb-4 text-foreground font-bold text-2xl"
        variant="h4"
      >
        Convert images to OME-Zarr format
      </Typography>
      <Typography className="my-4 text-large text-foreground">
        This form will create a new request for Scientific Computing to convert
        the image data at this path to OME-Zarr format, suitable for viewing in
        external viewers like Neuroglancer.
      </Typography>
      <form
        onSubmit={async event => {
          event.preventDefault();
          const createTicketResult = await handleTicketSubmit();

          if (!createTicketResult.success) {
            toast.error(`Error creating ticket: ${createTicketResult.error}`);
          } else {
            await allTicketsQuery.refetch();
            toast.success('Ticket created!');
          }
          setShowConvertFileDialog(false);
        }}
      >
        <TextWithFilePath path={displayPath} text="Source Folder" />
        <FgFormField
          error={
            !tasksEnabled
              ? 'This functionality is disabled. If you think this is an error, contact the app administrator.'
              : destinationFolder && !destinationValidation.isValid
                ? 'Destination folder cannot contain consecutive dots (..).'
                : undefined
          }
          htmlFor="destination_folder"
          label="Destination Folder"
        >
          <div className="flex gap-2 items-center">
            <FgInput
              autoFocus
              className="flex-1"
              disabled={!tasksEnabled}
              id="destination_folder"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setDestinationFolder(event.target.value);
              }}
              placeholder={placeholderText}
              size="lg"
              type="text"
              value={destinationFolder}
            />
            <FileSelectorButton
              initialLocation={initialLocation}
              onSelect={path => setDestinationFolder(path)}
            />
          </div>
        </FgFormField>
        <FgFormField
          error={tasksEnabled ? filenameValidation.errorMessage : undefined}
          htmlFor="output_filename"
          label="Output File or Folder Name"
        >
          <FgInput
            disabled={!tasksEnabled}
            id="output_filename"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setOutputFilename(event.target.value);
            }}
            placeholder="converted_data.zarr"
            size="lg"
            type="text"
            value={outputFilename}
          />
        </FgFormField>
        <FgButton
          disabled={
            !destinationFolder ||
            !outputFilename ||
            !destinationValidation.isValid ||
            !filenameValidation.isValid ||
            !tasksEnabled ||
            createTicketMutation.isPending ||
            allTicketsQuery.isFetching
          }
          loading={createTicketMutation.isPending || allTicketsQuery.isFetching}
          loadingText="Processing..."
          type="submit"
        >
          Submit
        </FgButton>
      </form>
    </FgDialog>
  );
}
