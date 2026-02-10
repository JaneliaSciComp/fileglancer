import { useEffect, useState } from 'react';
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
import { TbLink, TbLinkOff } from 'react-icons/tb';

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
  isDataLink,
  isSymlink
}: {
  readonly path: string;
  readonly isDataLink?: boolean;
  readonly isSymlink?: boolean;
}) {
  return (
    <div className="group flex justify-between items-center min-w-0 max-w-full">
      <FgTooltip label={path} triggerClasses="block truncate">
        <Typography className="text-foreground text-sm truncate">
          <span className="!font-bold">
            {isDataLink
              ? 'Data Link: '
              : isSymlink
                ? 'Linked path: '
                : 'Path: '}
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
              `${isDataLink ? 'Data link' : isSymlink ? 'Linked path' : 'Path'} copied to clipboard!`
            );
          } else {
            toast.error(
              `Failed to copy ${isDataLink ? 'data link' : isSymlink ? 'linked path' : 'path'}. Error: ${result.error}`
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
}: PropertiesDrawerProps) {
  const location = useLocation();
  const [showDataLinkDialog, setShowDataLinkDialog] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('overview');

  const { fileQuery, fileBrowserState } = useFileBrowserContext();
  const { pathPreference, areDataLinksAutomatic } = usePreferencesContext();
  const { ticketByPathQuery } = useTicketContext();
  const {
    allProxiedPathsQuery,
    proxiedPathByFspAndPathQuery,
    deleteProxiedPathMutation
  } = useProxiedPathContext();
  const { externalDataUrlQuery } = useExternalBucketContext();

  const {
    handleDialogConfirm,
    handleDialogCancel,
    handleCreateDataLink,
    handleDeleteDataLink
  } = useDataToolLinks(setShowDataLinkDialog);

  const tasksEnabled = import.meta.env.VITE_ENABLE_TASKS === 'true';

  // Set active tab to 'convert' when navigating from jobs page
  useEffect(() => {
    if (location.state?.openConvertTab) {
      setActiveTab('convert');
    }
  }, [location.state]);

  const fullPath = getPreferredPathForDisplay(
    pathPreference,
    fileQuery.data?.currentFileSharePath,
    fileBrowserState.propertiesTarget?.path
  );

  const tooltipTriggerClasses = 'max-w-[calc(100%-2rem)] truncate';

  return (
    <div data-tour="properties-drawer">
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

        {fileQuery.data?.currentFileOrFolder &&
        fileBrowserState.propertiesTarget ? (
          <div className="shrink-0 flex items-center gap-2 mt-3 mb-4 max-h-min">
            {fileBrowserState.propertiesTarget.is_symlink ? (
              <>
                {fileBrowserState.propertiesTarget.symlink_target_fsp ? (
                  <TbLink className="icon-default" />
                ) : (
                  <TbLinkOff className="icon-default text-error" />
                )}
                <div className="flex flex-col min-w-0 gap-1">
                  <FgTooltip
                    label={fileBrowserState.propertiesTarget.name}
                    triggerClasses="truncate"
                  >
                    <Typography className="font-semibold truncate">
                      {fileBrowserState.propertiesTarget.name}
                    </Typography>
                  </FgTooltip>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
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

              {tasksEnabled && !fileBrowserState.propertiesTarget.is_symlink ? (
                <Tabs.Trigger
                  className="!text-foreground h-full"
                  value="convert"
                >
                  Convert
                </Tabs.Trigger>
              ) : null}
              <Tabs.TriggerIndicator className="h-full" />
            </Tabs.List>

            {/*Overview panel*/}
            <Tabs.Panel
              className="flex-1 flex flex-col gap-4 max-w-full p-2"
              value="overview"
            >
              <CopyPathButton
                isSymlink={fileBrowserState.propertiesTarget.is_symlink}
                path={fullPath}
              />
              <OverviewTable file={fileBrowserState.propertiesTarget} />
              {fileBrowserState.propertiesTarget.is_dir &&
              (proxiedPathByFspAndPathQuery.isPending ||
                externalDataUrlQuery.isPending) ? (
                <Typography className="text-foreground pt-2">
                  Loading data link information...
                </Typography>
              ) : fileBrowserState.propertiesTarget.is_dir &&
                proxiedPathByFspAndPathQuery.isError ? (
                <>
                  <Typography className="text-error pt-2">
                    Error loading data link information
                  </Typography>
                  <Typography className="text-foreground" type="small">
                    {proxiedPathByFspAndPathQuery.error.message ||
                      'An unknown error occurred'}
                  </Typography>
                </>
              ) : fileBrowserState.propertiesTarget.is_dir &&
                externalDataUrlQuery.isError ? (
                <>
                  <Typography className="text-error pt-2">
                    Error loading external data link information
                  </Typography>
                  <Typography className="text-foreground" type="small">
                    {externalDataUrlQuery.error.message ||
                      'An unknown error occurred'}
                  </Typography>
                </>
              ) : fileBrowserState.propertiesTarget.is_dir ? (
                <>
                  <div className="flex flex-col gap-2 min-w-[175px] max-w-full pt-2">
                    <div className="flex items-center gap-2 max-w-full">
                      <Switch
                        checked={
                          externalDataUrlQuery.data ||
                          proxiedPathByFspAndPathQuery.data
                            ? true
                            : false
                        }
                        className="before:bg-primary/50 after:border-primary/50 checked:disabled:before:bg-surface checked:disabled:before:border checked:disabled:before:border-surface-dark checked:disabled:after:border-surface-dark"
                        disabled={Boolean(
                          externalDataUrlQuery.data ||
                            fileBrowserState.propertiesTarget.hasRead === false
                        )}
                        id="share-switch"
                        onChange={async () => {
                          if (
                            areDataLinksAutomatic &&
                            !proxiedPathByFspAndPathQuery.data
                          ) {
                            await handleCreateDataLink();
                          } else {
                            setShowDataLinkDialog(true);
                          }
                        }}
                      />
                      <Typography
                        as="label"
                        className={`${externalDataUrlQuery.data || fileBrowserState.propertiesTarget.hasRead === false ? 'cursor-default' : 'cursor-pointer'} text-foreground font-semibold`}
                        htmlFor="share-switch"
                      >
                        {proxiedPathByFspAndPathQuery.data
                          ? 'Delete data link'
                          : 'Create data link'}
                      </Typography>
                    </div>
                    <Typography
                      className="text-foreground whitespace-normal w-full"
                      type="small"
                    >
                      {externalDataUrlQuery.data
                        ? 'Public data link already exists since this data is on s3.janelia.org.'
                        : proxiedPathByFspAndPathQuery.data
                          ? 'Deleting the data link will remove data access for collaborators with the link.'
                          : 'Creating a data link allows you to share the data at this path with internal collaborators or use tools to view the data.'}
                    </Typography>
                  </div>
                  {externalDataUrlQuery.data ? (
                    <CopyPathButton
                      isDataLink={true}
                      path={externalDataUrlQuery.data}
                    />
                  ) : proxiedPathByFspAndPathQuery.data?.url ? (
                    <CopyPathButton
                      isDataLink={true}
                      path={proxiedPathByFspAndPathQuery.data.url}
                    />
                  ) : null}
                </>
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
            {tasksEnabled && !fileBrowserState.propertiesTarget.is_symlink ? (
              <Tabs.Panel
                className="flex flex-col gap-4 flex-1 w-full p-2"
                value="convert"
              >
                {ticketByPathQuery.isPending ? (
                  <Typography className="text-foreground">
                    Loading ticket information...
                  </Typography>
                ) : ticketByPathQuery.isError ? (
                  <>
                    <Typography className="text-error">
                      Error loading ticket information
                    </Typography>
                    <Typography className="text-foreground" type="small">
                      {ticketByPathQuery.error.message ||
                        'An unknown error occurred'}
                    </Typography>
                  </>
                ) : ticketByPathQuery.data ? (
                  <TicketDetails ticket={ticketByPathQuery.data} />
                ) : (
                  <>
                    <Typography className="min-w-64">
                      Scientific Computing can help you convert images to
                      OME-Zarr format, suitable for viewing in external viewers
                      like Neuroglancer.
                    </Typography>
                    <Button
                      data-tour="open-conversion-request"
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
            ) : null}
          </Tabs>
        ) : null}
      </Card>
      {showDataLinkDialog &&
      !proxiedPathByFspAndPathQuery.data &&
      !externalDataUrlQuery.data ? (
        <DataLinkDialog
          action="create"
          onCancel={handleDialogCancel}
          onConfirm={handleDialogConfirm}
          setShowDataLinkDialog={setShowDataLinkDialog}
          showDataLinkDialog={showDataLinkDialog}
          tools={false}
        />
      ) : showDataLinkDialog && proxiedPathByFspAndPathQuery.data ? (
        <DataLinkDialog
          action="delete"
          handleDeleteDataLink={handleDeleteDataLink}
          pending={
            deleteProxiedPathMutation.isPending ||
            allProxiedPathsQuery.isPending
          }
          proxiedPath={proxiedPathByFspAndPathQuery.data}
          setShowDataLinkDialog={setShowDataLinkDialog}
          showDataLinkDialog={showDataLinkDialog}
        />
      ) : null}
    </div>
  );
}
