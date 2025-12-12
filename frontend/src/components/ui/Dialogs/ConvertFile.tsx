import type { ChangeEvent } from 'react';
import { Button, Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgDialog from './FgDialog';
import TextWithFilePath from './TextWithFilePath';
import { Spinner } from '@/components/ui/widgets/Loaders';
import useConvertFileDialog from '@/hooks/useConvertFileDialog';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useTicketContext } from '@/contexts/TicketsContext';
import { getPreferredPathForDisplay } from '@/utils/pathHandling';
import FileSelectorButton from '@/components/ui/BrowsePage/FileSelector/FileSelectorButton';

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
        <div className="flex flex-col gap-2 my-4">
          <Typography
            as="label"
            className="text-foreground font-semibold"
            htmlFor="destination_folder"
          >
            Destination Folder
          </Typography>
          <div className="flex gap-2 items-center">
            <input
              autoFocus
              className="flex-1 p-2 text-foreground text-lg border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!tasksEnabled}
              id="destination_folder"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setDestinationFolder(event.target.value);
              }}
              placeholder={placeholderText}
              type="text"
              value={destinationFolder}
            />
            <FileSelectorButton
              initialLocation={initialLocation}
              onSelect={path => setDestinationFolder(path)}
            />
          </div>
          {!tasksEnabled ? (
            <Typography className="text-error" type="small">
              This functionality is disabled. If you think this is an error,
              contact the app administrator.
            </Typography>
          ) : null}
          {tasksEnabled &&
          destinationFolder &&
          !destinationValidation.isValid ? (
            <Typography className="text-error" type="small">
              {destinationValidation.hasConsecutiveDots
                ? 'Destination folder cannot contain consecutive dots (..).'
                : null}
            </Typography>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 my-4">
          <Typography
            as="label"
            className="text-foreground font-semibold"
            htmlFor="output_filename"
          >
            Output File or Folder Name
          </Typography>
          <input
            className="p-2 text-foreground text-lg border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!tasksEnabled}
            id="output_filename"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setOutputFilename(event.target.value);
            }}
            placeholder="converted_data.zarr"
            type="text"
            value={outputFilename}
          />
          {tasksEnabled && outputFilename && !filenameValidation.isValid ? (
            <Typography className="text-error" type="small">
              {filenameValidation.hasSlashes
                ? 'Output name cannot contain slashes. '
                : null}
              {filenameValidation.hasConsecutiveDots
                ? 'Output name cannot contain consecutive dots (..). '
                : null}
            </Typography>
          ) : null}
        </div>
        <Button
          className="!rounded-md"
          disabled={
            !destinationFolder ||
            !outputFilename ||
            !destinationValidation.isValid ||
            !filenameValidation.isValid ||
            !tasksEnabled ||
            createTicketMutation.isPending ||
            allTicketsQuery.isFetching
          }
          type="submit"
        >
          {createTicketMutation.isPending || allTicketsQuery.isFetching ? (
            <Spinner customClasses="border-white" text="Processing..." />
          ) : (
            'Submit'
          )}
        </Button>
      </form>
    </FgDialog>
  );
}
