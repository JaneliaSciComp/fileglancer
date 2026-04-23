import { useState } from 'react';
import type { ChangeEvent } from 'react';

import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { handleError, createSuccess } from '@/utils/errorHandling';
import type { Result } from '@/shared.types';

export default function usePermissionsDialog() {
  const { fileQuery, fileBrowserState, mutations } = useFileBrowserContext();

  const [localPermissions, setLocalPermissions] = useState(
    fileBrowserState.propertiesTarget
      ? fileBrowserState.propertiesTarget.permissions
      : null
  );

  /**
   * For execute positions (3, 6, 9), determine the correct character based on
   * whether execute is set and whether a special bit (sticky) is active.
   * Position 9 uses 't'/'T' for sticky bit; positions 3 and 6 use 's'/'S' for setuid/setgid.
   */
  function getExecuteChar(
    position: number,
    execute: boolean,
    currentChar: string
  ): string {
    const hasSpecial =
      position === 9
        ? currentChar === 't' || currentChar === 'T'
        : currentChar === 's' || currentChar === 'S';

    if (hasSpecial) {
      // Special bit is set - use lowercase (with execute) or uppercase (without)
      const specialChar = position === 9 ? 't' : 's';
      return execute ? specialChar : specialChar.toUpperCase();
    }
    return execute ? 'x' : '-';
  }

  /**
   * For the sticky bit toggle at position 9, determine the correct character
   * based on whether sticky is set and whether execute is also set.
   */
  function getStickyChar(sticky: boolean, currentChar: string): string {
    const hasExecute = currentChar === 'x' || currentChar === 't';
    if (sticky) {
      return hasExecute ? 't' : 'T';
    }
    return hasExecute ? 'x' : '-';
  }

  /**
   * Handles local permission state changes based on user input to the form.
   * This local state is necessary to track the user's changes before the form is submitted,
   * which causes the state in the fileglancer db to update.
   * @param event - The change event from the input field.
   * @returns void - Nothing is returned; the local permission state is updated.
   */
  function handleLocalPermissionChange(event: ChangeEvent<HTMLInputElement>) {
    if (!localPermissions) {
      return null; // If the local permissions are not set, this means the fileBrowserState is not set, return null
    }
    // Extract the value (r, w, x, or t for sticky) and position in the UNIX permission string
    // from the input name
    const { name, checked } = event.target;
    const [value, position] = name.split('_');
    const pos = parseInt(position);

    setLocalPermissions(prev => {
      if (!prev) {
        return prev; // If the prev local permission string is null, that means the fileBrowserState isn't set yet, so return null
      }
      const splitPermissions = prev.split('');
      const currentChar = splitPermissions[pos];

      if (value === 'x') {
        // Execute toggle - must account for sticky/setuid/setgid special bits
        splitPermissions[pos] = getExecuteChar(pos, checked, currentChar);
      } else if (value === 't') {
        // Sticky bit toggle at position 9
        splitPermissions[pos] = getStickyChar(checked, currentChar);
      } else if (checked) {
        // Read or write - set the value at that position
        splitPermissions[pos] = value;
      } else {
        // Unchecked read or write - set to '-'
        splitPermissions[pos] = '-';
      }

      return splitPermissions.join('');
    });
  }

  async function handleChangePermissions(): Promise<Result<void>> {
    try {
      if (!fileQuery.data?.currentFileSharePath) {
        throw new Error(
          'Cannot change permissions; no file share path selected'
        );
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

      return createSuccess(undefined);
    } catch (error) {
      return handleError(error);
    }
  }

  return {
    handleLocalPermissionChange,
    localPermissions,
    handleChangePermissions
  };
}
