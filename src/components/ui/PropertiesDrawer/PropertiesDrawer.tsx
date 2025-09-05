import * as React from 'react';
import {
  Button,
  Card,
  IconButton,
  Typography,
  Tabs
} from '@material-tailwind/react';
import toast from 'react-hot-toast';
import { HiOutlineDocument, HiOutlineDuplicate, HiX } from 'react-icons/hi';
import { HiOutlineFolder } from 'react-icons/hi2';

import PermissionsTable from './PermissionsTable';
import OverviewTable from './OverviewTable';
import TicketDetails from './TicketDetails';
import { getPreferredPathForDisplay } from '@/utils';
import { copyToClipboard } from '@/utils/copyText';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useTicketContext } from '@/contexts/TicketsContext';
import FgTooltip from '../widgets/FgTooltip';

type PropertiesDrawerProps = {
  togglePropertiesDrawer: () => void;
  setShowPermissionsDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setShowConvertFileDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function PropertiesDrawer({
  togglePropertiesDrawer,
  setShowPermissionsDialog,
  setShowConvertFileDialog
}: PropertiesDrawerProps): JSX.Element {
  const { fileBrowserState } = useFileBrowserContext();
  const { pathPreference } = usePreferencesContext();
  const { ticket } = useTicketContext();

  const fullPath = getPreferredPathForDisplay(
    pathPreference,
    fileBrowserState.currentFileSharePath,
    fileBrowserState.propertiesTarget?.path
  );

  const tooltipTriggerClasses = 'max-w-[calc(100%-2rem)] truncate';

  return (
    <Card className="overflow-auto w-full h-full max-h-full p-3 rounded-none shadow-none flex flex-col border-0">
      <div className="flex items-center justify-between gap-4 mb-1 shrink-0">
        <Typography type="h6">Properties</Typography>
        <IconButton
          size="sm"
          variant="ghost"
          color="secondary"
          className="h-8 w-8 rounded-full text-foreground hover:bg-secondary-light/20 shrink-0"
          onClick={() => {
            togglePropertiesDrawer();
          }}
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
          key="file-properties-tabs"
          defaultValue="overview"
          className="flex flex-col flex-1 min-h-0 "
        >
          <Tabs.List className="justify-start items-stretch shrink-0 min-w-fit w-full py-2 bg-surface dark:bg-surface-light">
            <Tabs.Trigger className="!text-foreground h-full" value="overview">
              Overview
            </Tabs.Trigger>

            <Tabs.Trigger
              className="!text-foreground h-full"
              value="permissions"
            >
              Permissions
            </Tabs.Trigger>

            <Tabs.Trigger className="!text-foreground h-full" value="convert">
              Convert
            </Tabs.Trigger>
            <Tabs.TriggerIndicator className="h-full" />
          </Tabs.List>

          <Tabs.Panel value="overview" className="flex-1 max-w-full p-2">
            <div className="group flex justify-between items-center min-w-0 max-w-full">
              <FgTooltip label={fullPath} triggerClasses="block truncate">
                <Typography className="text-foreground text-sm truncate">
                  <span className="!font-bold">Path: </span>
                  {fullPath}
                </Typography>
              </FgTooltip>

              <IconButton
                variant="ghost"
                isCircular
                className="text-transparent group-hover:text-foreground shrink-0"
                onClick={() => {
                  if (fileBrowserState.propertiesTarget) {
                    try {
                      copyToClipboard(fullPath);
                      toast.success('Path copied to clipboard!');
                    } catch (error) {
                      toast.error(`Failed to copy path. Error: ${error}`);
                    }
                  }
                }}
              >
                <HiOutlineDuplicate className="icon-small" />
              </IconButton>
            </div>

            <OverviewTable file={fileBrowserState.propertiesTarget} />
          </Tabs.Panel>

          <Tabs.Panel
            value="permissions"
            className="flex flex-col max-w-full gap-4 flex-1 p-2"
          >
            <PermissionsTable file={fileBrowserState.propertiesTarget} />
            <Button
              variant="outline"
              onClick={() => {
                setShowPermissionsDialog(true);
              }}
              className="!rounded-md !text-primary !text-nowrap !self-start"
            >
              Change Permissions
            </Button>
          </Tabs.Panel>

          <Tabs.Panel
            value="convert"
            className="flex flex-col gap-4 flex-1 w-full p-2"
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
                  variant="outline"
                  onClick={() => {
                    setShowConvertFileDialog(true);
                  }}
                >
                  Open conversion request
                </Button>
              </>
            )}
          </Tabs.Panel>
        </Tabs>
      ) : null}
    </Card>
  );
}
