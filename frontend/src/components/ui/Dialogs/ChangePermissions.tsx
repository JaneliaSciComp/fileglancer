import toast from 'react-hot-toast';

import FgDialog from './FgDialog';
import TextWithFilePath from './TextWithFilePath';
import usePermissionsDialog from '@/hooks/usePermissionsDialog';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgCheckbox from '@/components/designSystem/atoms/formElements/FgCheckbox';

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
                <th className="px-3 py-2 text-left font-medium">Execute</th>
              </tr>
            </thead>

            {localPermissions ? (
              <tbody className="text-sm">
                <tr className="border-b border-surface dark:border-surface-light">
                  <td className="p-3 font-medium">
                    Owner: {fileBrowserState.propertiesTarget.owner}
                  </td>
                  {/* Owner read/write/execute */}
                  <td className="p-3">
                    <FgCheckbox
                      checked={localPermissions[1] === 'r'}
                      color="secondary"
                      disabled
                      hideLabel
                      label="Owner can read, cannot be changed"
                      name="r_1"
                    />
                  </td>
                  <td className="p-3">
                    <FgCheckbox
                      checked={localPermissions[2] === 'w'}
                      color="secondary"
                      hideLabel
                      label="Owner can write"
                      name="w_2"
                      onChange={event => handleLocalPermissionChange(event)}
                    />
                  </td>
                  <td className="p-3">
                    <FgCheckbox
                      checked={
                        localPermissions[3] === 'x' ||
                        localPermissions[3] === 's'
                      }
                      color="secondary"
                      hideLabel
                      label="Owner can execute"
                      name="x_3"
                      onChange={event => handleLocalPermissionChange(event)}
                    />
                  </td>
                </tr>

                <tr className="border-b border-surface dark:border-surface-light">
                  <td className="p-3 font-medium">
                    Group: {fileBrowserState.propertiesTarget.group}
                  </td>
                  {/* Group read/write/execute */}
                  <td className="p-3">
                    <FgCheckbox
                      checked={localPermissions[4] === 'r'}
                      color="secondary"
                      hideLabel
                      label="Group can read"
                      name="r_4"
                      onChange={event => handleLocalPermissionChange(event)}
                    />
                  </td>
                  <td className="p-3">
                    <FgCheckbox
                      checked={localPermissions[5] === 'w'}
                      color="secondary"
                      hideLabel
                      label="Group can write"
                      name="w_5"
                      onChange={event => handleLocalPermissionChange(event)}
                    />
                  </td>
                  <td className="p-3">
                    <FgCheckbox
                      checked={
                        localPermissions[6] === 'x' ||
                        localPermissions[6] === 's'
                      }
                      color="secondary"
                      hideLabel
                      label="Group can execute"
                      name="x_6"
                      onChange={event => handleLocalPermissionChange(event)}
                    />
                  </td>
                </tr>

                <tr>
                  <td className="p-3 font-medium">Everyone else</td>
                  {/* Everyone else read/write/execute */}
                  <td className="p-3">
                    <FgCheckbox
                      checked={localPermissions[7] === 'r'}
                      color="secondary"
                      hideLabel
                      label="Everyone else can read"
                      name="r_7"
                      onChange={event => handleLocalPermissionChange(event)}
                    />
                  </td>
                  <td className="p-3">
                    <FgCheckbox
                      checked={localPermissions[8] === 'w'}
                      color="secondary"
                      hideLabel
                      label="Everyone else can write"
                      name="w_8"
                      onChange={event => handleLocalPermissionChange(event)}
                    />
                  </td>
                  <td className="p-3">
                    <FgCheckbox
                      checked={
                        localPermissions[9] === 'x' ||
                        localPermissions[9] === 't'
                      }
                      color="secondary"
                      hideLabel
                      label="Everyone else can execute"
                      name="x_9"
                      onChange={event => handleLocalPermissionChange(event)}
                    />
                  </td>
                </tr>
              </tbody>
            ) : null}
          </table>

          {fileBrowserState.propertiesTarget.is_dir && localPermissions ? (
            <div className="flex flex-col gap-4 mb-4">
              <FgCheckbox
                checked={
                  localPermissions[6] === 's' || localPermissions[6] === 'S'
                }
                color="secondary"
                label={`New files created in this directory belong to group
                  ${fileBrowserState.propertiesTarget.group}, regardless
                  of the file creator's primary group`}
                name="s_6"
                onChange={event => handleLocalPermissionChange(event)}
              />
              <FgCheckbox
                checked={
                  localPermissions[9] === 't' || localPermissions[9] === 'T'
                }
                color="secondary"
                label="Only owner can delete and rename files in this directory"
                name="t_9"
                onChange={event => handleLocalPermissionChange(event)}
              />
            </div>
          ) : null}
          <FgButton
            disabled={Boolean(
              mutations.changePermissions.isPending ||
              localPermissions === fileBrowserState.propertiesTarget.permissions
            )}
            loading={mutations.changePermissions.isPending}
            loadingText="Updating..."
            type="submit"
          >
            Change Permissions
          </FgButton>
        </form>
      ) : null}
    </FgDialog>
  );
}
