import * as React from 'react';
import {
  Button,
  Card,
  IconButton,
  Switch,
  Typography,
  Tabs
} from '@material-tailwind/react';
import toast from 'react-hot-toast';
import { HiOutlineDocument, HiOutlineDuplicate, HiX } from 'react-icons/hi';
import { HiOutlineFolder } from 'react-icons/hi2';
import { useLocation } from 'react-router';

import PermissionsTable from '@/components/ui/PropertiesDrawer/PermissionsTable';
import OverviewTable from '@/components/ui/PropertiesDrawer/OverviewTable';
import TicketDetails from '@/components/ui/PropertiesDrawer/TicketDetails';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import DataLinkDialog from '@/components/ui/Dialogs/DataLink';
import { getPreferredPathForDisplay } from '@/utils';
import { copyToClipboard } from '@/utils/copyText';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useTicketContext } from '@/contexts/TicketsContext';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useExternalBucketContext } from '@/contexts/ExternalBucketContext';
import useDataToolLinks from '@/hooks/useDataToolLinks';

type PropertiesDrawerProps = {
  readonly togglePropertiesDrawer: () => void;
  readonly setShowPermissionsDialog: React.Dispatch<
    React.SetStateAction<boolean>
  >;
  readonly setShowConvertFileDialog: React.Dispatch<
    React.SetStateAction<boolean>
  >;
};

function CopyPathButton({
  path,
  isDataLink
}: {
  readonly path: string;
  readonly isDataLink?: boolean;
}): JSX.Element {
  return (
    <div className="group flex justify-between items-center min-w-0 max-w-full">
      <FgTooltip label={path} triggerClasses="block truncate">
        <Typography className="text-foreground text-sm truncate">
          <span className="!font-bold">
            {isDataLink ? 'Data Link: ' : 'Path: '}
          </span>
          {path}
        </Typography>
      </FgTooltip>
      <IconButton
        className="text-transparent group-hover:text-foreground shrink-0"
        isCircular
        onClick={async () => {
          const result = await copyToClipboard(path);
          if (result.success) {
            toast.success(
              `${isDataLink ? 'Data link' : 'Path'} copied to clipboard!`
            );
          } else {
            toast.error(
              `Failed to copy ${isDataLink ? 'data link' : 'path'}. Error: ${result.error}`
            );
          }
        }}
        variant="ghost"
      >
        <HiOutlineDuplicate className="icon-small" />
      </IconButton>
    </div>
  );
}

export default function PropertiesDrawer({
  togglePropertiesDrawer,
  setShowPermissionsDialog,
  setShowConvertFileDialog
}: PropertiesDrawerProps): JSX.Element {
  const location = useLocation();
  const [showDataLinkDialog, setShowDataLinkDialog] =
    React.useState<boolean>(false);
  const [activeTab, setActiveTab] = React.useState<string>('overview');

  const { fileBrowserState } = useFileBrowserContext();
  const { pathPreference, areDataLinksAutomatic } = usePreferencesContext();
  const { ticket } = useTicketContext();
  const { proxiedPath, dataUrl } = useProxiedPathContext();
  const { externalDataUrl } = useExternalBucketContext();
  const {
    handleDialogConfirm,
    handleDialogCancel,
    handleCreateDataLink,
    handleDeleteDataLink
  } = useDataToolLinks(setShowDataLinkDialog);

  const tasksEnabled = import.meta.env.VITE_ENABLE_TASKS === 'true';

  // Set active tab to 'convert' when navigating from jobs page
  React.useEffect(() => {
    if (location.state?.openConvertTab) {
      setActiveTab('convert');
    }
  }, [location.state]);

  const fullPath = getPreferredPathForDisplay(
    pathPreference,
    fileBrowserState.currentFileSharePath,
    fileBrowserState.propertiesTarget?.path
  );

  const tooltipTriggerClasses = 'max-w-[calc(100%-2rem)] truncate';

  return (
    <>
      <Card className="overflow-auto w-full h-full max-h-full p-3 rounded-none shadow-none flex flex-col border-0">
        <div className="flex items-center justify-between gap-4 mb-1 shrink-0">
          <Typography type="h6">Properties</Typography>
          <IconButton
            className="h-8 w-8 rounded-full text-foreground hover:bg-secondary-light/20 shrink-0"
            color="secondary"
            onClick={() => {
              togglePropertiesDrawer();
            }}
            size="sm"
            variant="ghost"
          >
            <HiX className="icon-default" />
          </IconButton>
        </div>

        {fileBrowserState.propertiesTarget ? (
          <div className="shrink-0 flex items-center gap-2 mt-3 mb-4 max-h-min">
            {fileBrowserState.propertiesTarget.is_dir ? (
              <HiOutlineFolder className="icon-default" />
            ) : (
              <HiOutlineDocument className="icon-default" />
            )}
            <FgTooltip
              label={fileBrowserState.propertiesTarget.name}
              triggerClasses={tooltipTriggerClasses}
            >
              <Typography className="font-semibold truncate max-w-min">
                {fileBrowserState.propertiesTarget?.name}
              </Typography>
            </FgTooltip>
          </div>
        ) : (
          <Typography className="mt-3 mb-4">
            Click on a file or folder to view its properties
          </Typography>
        )}
        {fileBrowserState.propertiesTarget ? (
          <Tabs
            className="flex flex-col flex-1 min-h-0 "
            key="file-properties-tabs"
            onValueChange={setActiveTab}
            value={activeTab}
          >
            <Tabs.List className="justify-start items-stretch shrink-0 min-w-fit w-full py-2 bg-surface dark:bg-surface-light">
              <Tabs.Trigger
                className="!text-foreground h-full"
                value="overview"
              >
                Overview
              </Tabs.Trigger>

              <Tabs.Trigger
                className="!text-foreground h-full"
                value="permissions"
              >
                Permissions
              </Tabs.Trigger>

              {tasksEnabled && (
                <Tabs.Trigger className="!text-foreground h-full" value="convert">
                  Convert
                </Tabs.Trigger>
              )}
              <Tabs.TriggerIndicator className="h-full" />
            </Tabs.List>

            {/*Overview panel*/}
            <Tabs.Panel
              className="flex-1 flex flex-col gap-4 max-w-full p-2"
              value="overview"
            >
              <CopyPathButton path={fullPath} />
              <OverviewTable file={fileBrowserState.propertiesTarget} />
              {fileBrowserState.propertiesTarget.is_dir ? (
                <div className="flex flex-col gap-2 min-w-[175px] max-w-full pt-2">
                  <div className="flex items-center gap-2 max-w-full">
                    <Switch
                      checked={externalDataUrl || proxiedPath ? true : false}
                      className="before:bg-primary/50 after:border-primary/50 checked:disabled:before:bg-surface checked:disabled:before:border checked:disabled:before:border-surface-dark checked:disabled:after:border-surface-dark"
                      disabled={Boolean(
                        externalDataUrl ||
                          fileBrowserState.propertiesTarget.hasRead === false
                      )}
                      id="share-switch"
                      onChange={async () => {
                        if (areDataLinksAutomatic && !proxiedPath) {
                          await handleCreateDataLink();
                        } else {
                          setShowDataLinkDialog(true);
                        }
                      }}
                    />
                    <Typography
                      as="label"
                      className={`${externalDataUrl || fileBrowserState.propertiesTarget.hasRead === false ? 'cursor-default' : 'cursor-pointer'} text-foreground font-semibold`}
                      htmlFor="share-switch"
                    >
                      {proxiedPath ? 'Delete data link' : 'Create data link'}
                    </Typography>
                  </div>
                  <Typography
                    className="text-foreground whitespace-normal w-full"
                    type="small"
                  >
                    {externalDataUrl
                      ? 'Public data link already exists since this data is on s3.janelia.org.'
                      : proxiedPath
                        ? 'Deleting the data link will remove data access for collaborators with the link.'
                        : 'Creating a data link allows you to share the data at this path with internal collaborators or use tools to view the data.'}
                  </Typography>
                </div>
              ) : null}
              {externalDataUrl ? (
                <CopyPathButton isDataLink={true} path={externalDataUrl} />
              ) : dataUrl ? (
                <CopyPathButton isDataLink={true} path={dataUrl} />
              ) : null}
            </Tabs.Panel>

            {/*Permissions panel*/}
            <Tabs.Panel
              className="flex flex-col max-w-full gap-4 flex-1 p-2"
              value="permissions"
            >
              <PermissionsTable file={fileBrowserState.propertiesTarget} />
              <Button
                className="!rounded-md !text-primary !text-nowrap !self-start"
                disabled={fileBrowserState.propertiesTarget.hasWrite === false}
                onClick={() => {
                  setShowPermissionsDialog(true);
                }}
                variant="outline"
              >
                Change Permissions
              </Button>
            </Tabs.Panel>

            {/*Task panel*/}
            {tasksEnabled && (
              <Tabs.Panel
                className="flex flex-col gap-4 flex-1 w-full p-2"
                value="convert"
              >
                {ticket ? (
                  <TicketDetails />
                ) : (
                  <>
                    <Typography className="min-w-64">
                      Scientific Computing can help you convert images to OME-Zarr
                      format, suitable for viewing in external viewers like
                      Neuroglancer.
                    </Typography>
                    <Button
                      disabled={
                        fileBrowserState.propertiesTarget.hasRead === false
                      }
                      onClick={() => {
                        setShowConvertFileDialog(true);
                      }}
                      variant="outline"
                    >
                      Open conversion request
                    </Button>
                  </>
                )}
              </Tabs.Panel>
            )}
          </Tabs>
        ) : null}
      </Card>
      {showDataLinkDialog && !proxiedPath && !externalDataUrl ? (
        <DataLinkDialog
          action="create"
          onCancel={handleDialogCancel}
          onConfirm={handleDialogConfirm}
          setShowDataLinkDialog={setShowDataLinkDialog}
          showDataLinkDialog={showDataLinkDialog}
          tools={false}
        />
      ) : showDataLinkDialog && proxiedPath ? (
        <DataLinkDialog
          action="delete"
          handleDeleteDataLink={handleDeleteDataLink}
          proxiedPath={proxiedPath}
          setShowDataLinkDialog={setShowDataLinkDialog}
          showDataLinkDialog={showDataLinkDialog}
        />
      ) : null}
    </>
  );
}
