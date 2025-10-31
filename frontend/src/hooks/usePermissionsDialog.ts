import React from 'react';

import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

export default function usePermissionsDialog() {
  const { fileQuery, fileBrowserState, mutations } = useFileBrowserContext();

  const [localPermissions, setLocalPermissions] = React.useState(
    fileBrowserState.propertiesTarget
      ? fileBrowserState.propertiesTarget.permissions
      : null
  );

  /**
   * Handles local permission state changes based on user input to the form.
   * This local state is necessary to track the user's changes before the form is submitted,
   * which causes the state in the fileglancer db to update.
   * @param event - The change event from the input field.
   * @returns void - Nothing is returned; the local permission state is updated.
   */
  function handleLocalPermissionChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    if (!localPermissions) {
      return null; // If the local permissions are not set, this means the fileBrowserState is not set, return null
    }
    // Extract the value (w - write or r - read) and position in the UNIX permission string
    // (1 - 8) from the input name
    const { name, checked } = event.target;
    const [value, position] = name.split('_');

    setLocalPermissions(prev => {
      if (!prev) {
        return prev; // If the prev local permission string is null, that means the fileBrowserState isn't set yet, so return null
      }
      // Split the previous local permission string at every character in the string
      const splitPermissions = prev.split('');
      // If the event checked the input, set that value (r/w) at that position in the string
      if (checked) {
        splitPermissions.splice(parseInt(position), 1, value);
      } else {
        // If the event unchecked the input, set the value to "-" at that posiiton in the string
        splitPermissions.splice(parseInt(position), 1, '-');
      }
      const newPermissions = splitPermissions.join('');
      return newPermissions;
    });
  }

  async function handleChangePermissions(): Promise<void> {
    if (!fileQuery.data?.currentFileSharePath) {
      throw new Error('Cannot change permissions; no file share path selected');
    }
    if (!fileBrowserState.propertiesTarget) {
      throw new Error('Cannot change permissions; no properties target set');
    }
    if (!localPermissions) {
      throw new Error('No permissions set');
    }

    await mutations.changePermissions.mutateAsync({
      fspName: fileQuery.data.currentFileSharePath.name,
      filePath: fileBrowserState.propertiesTarget.path,
      permissions: localPermissions
    });
  }

  return {
    handleLocalPermissionChange,
    localPermissions,
    handleChangePermissions
  };
}
