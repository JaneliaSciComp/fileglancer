import React from 'react';
import toast from 'react-hot-toast';
import {
  Button,
  Dialog,
  IconButton,
  Typography
} from '@material-tailwind/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

import usePermissionsDialog from '@/hooks/usePermissionsDialog';
import type { FileOrFolder } from '@/shared.types';

type ChangePermissionsProps = {
  targetItem: FileOrFolder | null;
  showPermissionsDialog: boolean;
  setShowPermissionsDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function ChangePermissions({
  targetItem,
  showPermissionsDialog,
  setShowPermissionsDialog
}: ChangePermissionsProps): JSX.Element {
  const { handleChangePermissions } = usePermissionsDialog();
  const [localPermissions, setLocalPermissions] = React.useState(
    targetItem ? targetItem.permissions : null
  );

  function handleLocalPermissionChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    if (!localPermissions) {
      return;
    }

    const { name, checked } = event.target;
    const [value, position] = name.split('_');

    setLocalPermissions(prev => {
      if (!prev) {
        return prev; // Ensure the type remains consistent
      }
      const splitPermissions = prev.split('');
      if (checked) {
        splitPermissions.splice(parseInt(position), 1, value);
      } else {
        splitPermissions.splice(parseInt(position), 1, '-');
      }
      const newPermissions = splitPermissions.join('');
      return newPermissions;
    });
  }

  return (
    <Dialog open={showPermissionsDialog}>
      <Dialog.Overlay>
        <Dialog.Content className="p-6 bg-surface-light dark:bg-surface">
          <IconButton
            size="sm"
            variant="outline"
            color="secondary"
            className="absolute right-4 top-4 text-secondary hover:text-background"
            isCircular
            onClick={() => {
              setShowPermissionsDialog(false);
            }}
          >
            <XMarkIcon className="icon-default" />
          </IconButton>
          {targetItem ? (
            <form
              onSubmit={async event => {
                event.preventDefault();
                if (!localPermissions) {
                  return;
                }
                const result = await handleChangePermissions(
                  targetItem,
                  localPermissions
                );
                if (result.success) {
                  toast.success(`Permissions updated for ${targetItem.name}`);
                } else if (result.error) {
                  toast.error(`Failed to update permissions: ${result.error}`);
                }
                setShowPermissionsDialog(false);
              }}
            >
              <Typography className="mt-8 text-foreground font-semibold">
                Change permisions for file
                <span className="font-semibold"> {targetItem.name}</span>
              </Typography>
              <table className="w-full my-4 border border-surface dark:border-surface-light text-foreground">
                <thead className="border-b border-surface dark:border-surface-light bg-surface-dark text-sm font-medium">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">
                      Who can view or edit this data?
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Read</th>
                    <th className="px-3 py-2 text-left font-medium">Write</th>
                  </tr>
                </thead>

                {localPermissions ? (
                  <tbody className="text-sm">
                    <tr className="border-b border-surface dark:border-surface-light">
                      <td className="p-3 font-medium">
                        Owner: {targetItem.owner}
                      </td>
                      {/* Owner read/write */}
                      <td className="p-3">
                        <input
                          type="checkbox"
                          name="r_1"
                          checked={localPermissions[1] === 'r'}
                          disabled
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          name="w_2"
                          checked={localPermissions[2] === 'w'}
                          onChange={event => handleLocalPermissionChange(event)}
                          className="accent-secondary-light hover:cursor-pointer"
                        />
                      </td>
                    </tr>

                    <tr className="border-b border-surface dark:border-surface-light">
                      <td className="p-3 font-medium">
                        Group: {targetItem.group}
                      </td>
                      {/* Group read/write */}
                      <td className="p-3">
                        <input
                          type="checkbox"
                          name="r_4"
                          checked={localPermissions[4] === 'r'}
                          onChange={event => handleLocalPermissionChange(event)}
                          className="accent-secondary-light hover:cursor-pointer"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          name="w_5"
                          checked={localPermissions[5] === 'w'}
                          onChange={event => handleLocalPermissionChange(event)}
                          className="accent-secondary-light hover:cursor-pointer"
                        />
                      </td>
                    </tr>

                    <tr>
                      <td className="p-3 font-medium">Everyone else</td>
                      {/* Everyone else read/write */}
                      <td className="p-3">
                        <input
                          type="checkbox"
                          name="r_7"
                          checked={localPermissions[7] === 'r'}
                          onChange={event => handleLocalPermissionChange(event)}
                          className="accent-secondary-light hover:cursor-pointer"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          name="w_8"
                          checked={localPermissions[8] === 'w'}
                          onChange={event => handleLocalPermissionChange(event)}
                          className="accent-secondary-light hover:cursor-pointer"
                        />
                      </td>
                    </tr>
                  </tbody>
                ) : null}
              </table>
              <Button className="!rounded-md" type="submit">
                Change Permissions
              </Button>
            </form>
          ) : null}
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog>
  );
}
