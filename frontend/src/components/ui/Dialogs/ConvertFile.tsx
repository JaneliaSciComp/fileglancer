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
  const { destinationFolder, setDestinationFolder, handleTicketSubmit } =
    useConvertFileDialog();
  const { pathPreference } = usePreferencesContext();
  const { fileBrowserState } = useFileBrowserContext();
  const { allTicketsQuery, createTicketMutation } = useTicketContext();

  const placeholderText =
    pathPreference[0] === 'windows_path'
      ? '\\path\\to\\destination\\folder\\'
      : '/path/to/destination/folder/';

  const displayPath = fileBrowserState.uiFileSharePath
    ? getPreferredPathForDisplay(
        pathPreference,
        fileBrowserState.uiFileSharePath,
        fileBrowserState.propertiesTarget?.path
      )
    : '';

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
          <input
            autoFocus
            className="mb-4 p-2 text-foreground text-lg border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!tasksEnabled}
            id="destination_folder"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setDestinationFolder(event.target.value);
            }}
            placeholder={placeholderText}
            type="text"
            value={destinationFolder}
          />
          {!tasksEnabled ? (
            <Typography className="text-error -mt-2" type="small">
              This functionality is disabled. If you think this is an error,
              contact the app administrator.
            </Typography>
          ) : null}
        </div>
        <Button
          className="!rounded-md"
          disabled={
            !destinationFolder ||
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
