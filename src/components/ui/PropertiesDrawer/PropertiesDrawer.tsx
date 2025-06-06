import * as React from 'react';
import {
  Alert,
  Button,
  Card,
  IconButton,
  Tooltip,
  Typography,
  Tabs
} from '@material-tailwind/react';
import {
  DocumentIcon,
  FolderIcon,
  Square2StackIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

import type { FileOrFolder } from '@/shared.types';

import PermissionsTable from './PermissionsTable';
import OverviewTable from './OverviewTable';
import useCopyPath from '@/hooks/useCopyPath';
import { getPreferredPathForDisplay } from '@/utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';

type PropertiesDrawerProps = {
  propertiesTarget: FileOrFolder | null;
  open: boolean;
  setShowPropertiesDrawer: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPermissionsDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function PropertiesDrawer({
  propertiesTarget,
  open,
  setShowPropertiesDrawer,
  setShowPermissionsDialog
}: PropertiesDrawerProps): JSX.Element {
  const {
    copiedText,
    showCopyAlert,
    setShowCopyAlert,
    copyToClipboard,
    dismissCopyAlert
  } = useCopyPath();
  const { currentFileSharePath } = useFileBrowserContext();
  const { pathPreference } = usePreferencesContext();

  const fullPath = getPreferredPathForDisplay(
    pathPreference,
    currentFileSharePath,
    propertiesTarget?.path
  );

  return (
    <Card className="min-w-full h-full max-h-full overflow-y-auto overflow-x-hidden p-4 rounded-none shadow-lg flex flex-col">
      <div className="flex items-center justify-between gap-4 mb-1">
        <Typography type="h6">Properties</Typography>
        <IconButton
          size="sm"
          variant="ghost"
          color="secondary"
          className="h-8 w-8 rounded-full text-foreground hover:bg-secondary-light/20"
          onClick={() => {
            if (open === true) {
              setShowCopyAlert(false);
            }
            setShowPropertiesDrawer((prev: boolean) => !prev);
          }}
        >
          <XMarkIcon className="icon-default" />
        </IconButton>
      </div>

      {propertiesTarget ? (
        <div className="flex items-center gap-2 mt-3 mb-4 max-h-min overflow-hidden">
          {propertiesTarget.is_dir ? (
            <FolderIcon className="icon-default" />
          ) : (
            <DocumentIcon className="icon-default" />
          )}{' '}
          <Tooltip>
            <Tooltip.Trigger className="max-w-[calc(100%-2rem)]">
              <Typography className="font-semibold truncate max-w-full">
                {propertiesTarget?.name}
              </Typography>
            </Tooltip.Trigger>
            <Tooltip.Content>{propertiesTarget?.name}</Tooltip.Content>
          </Tooltip>
        </div>
      ) : (
        <Typography className="mt-3 mb-4">
          Click on a file or folder to view its properties
        </Typography>
      )}
      {propertiesTarget ? (
        <Tabs key="file-properties-tabs" defaultValue="overview">
          <Tabs.List className="w-full rounded-none border-b border-secondary-dark  bg-transparent dark:bg-transparent py-0">
            <Tabs.Trigger className="w-full !text-foreground" value="overview">
              Overview
            </Tabs.Trigger>

            <Tabs.Trigger
              className="w-full !text-foreground"
              value="permissions"
            >
              Permissions
            </Tabs.Trigger>

            <Tabs.Trigger className="w-full !text-foreground" value="convert">
              Convert
            </Tabs.Trigger>
            <Tabs.TriggerIndicator className="rounded-none border-b-2 border-secondary bg-transparent dark:bg-transparent shadow-none" />
          </Tabs.List>

          <Tabs.Panel value="overview">
            <div className="group flex justify-between items-center overflow-x-hidden">
              <Tooltip>
                <Tooltip.Trigger className="max-w-[calc(100%-2rem)]">
                  <Typography className="text-foreground font-medium text-sm truncate max-w-full">
                    <span className="!font-bold">Path: </span>
                    {fullPath}
                  </Typography>
                </Tooltip.Trigger>
                <Tooltip.Content className="z-10">{fullPath}</Tooltip.Content>
              </Tooltip>

              <IconButton
                variant="ghost"
                isCircular
                className="text-transparent group-hover:text-foreground"
                onClick={() => {
                  if (propertiesTarget) {
                    copyToClipboard(fullPath);
                  }
                }}
              >
                <Square2StackIcon className="icon-small" />
              </IconButton>
            </div>

            {copiedText.value === fullPath &&
            copiedText.isCopied === true &&
            showCopyAlert === true ? (
              <Alert className="flex items-center justify-between bg-secondary-light/70 border-none">
                <Alert.Content>Path copied to clipboard!</Alert.Content>
                <XMarkIcon
                  className="icon-default cursor-pointer"
                  onClick={dismissCopyAlert}
                />
              </Alert>
            ) : null}
            <OverviewTable file={propertiesTarget} />
          </Tabs.Panel>

          <Tabs.Panel value="permissions" className="flex flex-col gap-2">
            <PermissionsTable file={propertiesTarget} />
            <Button
              variant="outline"
              onClick={() => {
                setShowPermissionsDialog(true);
              }}
              className="!rounded-md"
            >
              Change Permissions
            </Button>
          </Tabs.Panel>

          <Tabs.Panel value="convert" className="flex flex-col gap-2">
            <Typography variant="small" className="font-medium">
              Convert data to OME-Zarr
            </Typography>
            <Button as="a" href="#" variant="outline">
              Submit
            </Button>
          </Tabs.Panel>
        </Tabs>
      ) : null}
    </Card>
  );
}
