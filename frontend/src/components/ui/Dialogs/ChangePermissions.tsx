import { Button } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgDialog from './FgDialog';
import TextWithFilePath from './TextWithFilePath';
import { Spinner } from '@/components/ui/widgets/Loaders';
import usePermissionsDialog from '@/hooks/usePermissionsDialog';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

type ChangePermissionsProps = {
  readonly showPermissionsDialog: boolean;
  readonly setShowPermissionsDialog: React.Dispatch<
    React.SetStateAction<boolean>
  >;
};

export default function ChangePermissions({
  showPermissionsDialog,
  setShowPermissionsDialog
}: ChangePermissionsProps) {
  const { fileBrowserState, mutations } = useFileBrowserContext();

  const {
    handleLocalPermissionChange,
    localPermissions,
    handleChangePermissions
  } = usePermissionsDialog();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!localPermissions) {
      toast.error('Error setting permissions: no local permission state');
      return;
    }
    if (!fileBrowserState.propertiesTarget) {
      toast.error('Error setting permissions: no properties target set');
      return;
    }
    const result = await handleChangePermissions();
    if (result.success) {
      toast.success('Permissions changed!');
    } else {
      toast.error(`Error changing permissions: ${result.error}`);
    }
    setShowPermissionsDialog(false);
  }

  return (
    <FgDialog
      onClose={() => setShowPermissionsDialog(false)}
      open={showPermissionsDialog}
    >
      {fileBrowserState.propertiesTarget ? (
        <form onSubmit={handleSubmit}>
          <TextWithFilePath
            path={fileBrowserState.propertiesTarget.name}
            text="Change permissions for file:"
          />
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
                    Owner: {fileBrowserState.propertiesTarget.owner}
                  </td>
                  {/* Owner read/write */}
                  <td className="p-3">
                    <input
                      aria-label="r_1"
                      checked={localPermissions[1] === 'r'}
                      disabled
                      name="r_1"
                      type="checkbox"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      aria-label="w_2"
                      checked={localPermissions[2] === 'w'}
                      className="accent-secondary-light hover:cursor-pointer"
                      name="w_2"
                      onChange={event => handleLocalPermissionChange(event)}
                      type="checkbox"
                    />
                  </td>
                </tr>

                <tr className="border-b border-surface dark:border-surface-light">
                  <td className="p-3 font-medium">
                    Group: {fileBrowserState.propertiesTarget.group}
                  </td>
                  {/* Group read/write */}
                  <td className="p-3">
                    <input
                      aria-label="r_4"
                      checked={localPermissions[4] === 'r'}
                      className="accent-secondary-light hover:cursor-pointer"
                      name="r_4"
                      onChange={event => handleLocalPermissionChange(event)}
                      type="checkbox"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      aria-label="w_5"
                      checked={localPermissions[5] === 'w'}
                      className="accent-secondary-light hover:cursor-pointer"
                      name="w_5"
                      onChange={event => handleLocalPermissionChange(event)}
                      type="checkbox"
                    />
                  </td>
                </tr>

                <tr>
                  <td className="p-3 font-medium">Everyone else</td>
                  {/* Everyone else read/write */}
                  <td className="p-3">
                    <input
                      aria-label="r_7"
                      checked={localPermissions[7] === 'r'}
                      className="accent-secondary-light hover:cursor-pointer"
                      name="r_7"
                      onChange={event => handleLocalPermissionChange(event)}
                      type="checkbox"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      aria-label="w_8"
                      checked={localPermissions[8] === 'w'}
                      className="accent-secondary-light hover:cursor-pointer"
                      name="w_8"
                      onChange={event => handleLocalPermissionChange(event)}
                      type="checkbox"
                    />
                  </td>
                </tr>
              </tbody>
            ) : null}
          </table>
          <Button
            className="!rounded-md"
            disabled={Boolean(
              mutations.changePermissions.isPending ||
                localPermissions ===
                  fileBrowserState.propertiesTarget.permissions
            )}
            type="submit"
          >
            {mutations.changePermissions.isPending ? (
              <Spinner customClasses="border-white" text="Updating..." />
            ) : (
              'Change Permissions'
            )}
          </Button>
        </form>
      ) : null}
    </FgDialog>
  );
}
