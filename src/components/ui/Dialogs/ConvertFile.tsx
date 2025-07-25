import React from 'react';
import { Button, Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgDialog from './FgDialog';
import TextWithFilePath from './TextWithFilePath';
import useConvertFileDialog from '@/hooks/useConvertFileDialog';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useTicketContext } from '@/contexts/TicketsContext';
import { getPreferredPathForDisplay } from '@/utils/pathHandling';

type ItemNamingDialogProps = {
  showConvertFileDialog: boolean;
  setShowConvertFileDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function ConvertFileDialog({
  showConvertFileDialog,
  setShowConvertFileDialog
}: ItemNamingDialogProps): JSX.Element {
  const { destinationFolder, setDestinationFolder, handleTicketSubmit } =
    useConvertFileDialog();
  const { pathPreference } = usePreferencesContext();
  const { propertiesTarget, currentFileSharePath } = useFileBrowserContext();
  const { fetchAllTickets } = useTicketContext();

  const placeholderText =
    pathPreference[0] === 'windows_path'
      ? '\\path\\to\\destination\\folder\\'
      : '/path/to/destination/folder/';

  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    currentFileSharePath,
    propertiesTarget?.path
  );

  return (
    <FgDialog
      open={showConvertFileDialog}
      onClose={() => setShowConvertFileDialog(false)}
    >
      <Typography
        variant="h4"
        className="mb-4 text-foreground font-bold text-2xl"
      >
        Convert image to OME-Zarr format
      </Typography>
      <Typography className="my-4 text-large text-foreground">
        This form will create a JIRA ticket to request conversion of the image
        data to OME-Zarr format, suitable for viewing in external viewers like
        Neuroglancer.
      </Typography>
      <form
        onSubmit={async event => {
          event.preventDefault();
          const createTicketResult = await handleTicketSubmit();

          if (!createTicketResult.success) {
            toast.error(`Error creating ticket: ${createTicketResult.error}`);
          } else {
            toast.success('Ticket created!');
            const refreshTicketResponse = await fetchAllTickets();
            if (!refreshTicketResponse.success) {
              toast.error(
                `Error refreshing ticket list: ${refreshTicketResponse.error}`
              );
            }
          }
          setShowConvertFileDialog(false);
        }}
      >
        <TextWithFilePath text="Source Folder" path={displayPath} />
        <div className="flex flex-col gap-2 mb-4">
          <Typography
            as="label"
            htmlFor="destination_folder"
            className="text-foreground font-semibold"
          >
            Destination Folder
          </Typography>
          <input
            type="text"
            id="destination_folder"
            autoFocus
            value={destinationFolder}
            placeholder={placeholderText}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setDestinationFolder(event.target.value);
            }}
            className="mb-4 p-2 text-foreground text-lg border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background"
          />
        </div>
        <Button className="!rounded-md" type="submit">
          Submit
        </Button>
      </form>
    </FgDialog>
  );
}
