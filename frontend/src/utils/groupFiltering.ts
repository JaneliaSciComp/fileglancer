import type { FileSharePath } from '@/shared.types';

/**
 * Internal helper: Determines if a File Share Path should be displayed based on group membership.
 * Returns true if the FSP belongs to a group the user belongs to, or if the FSP is public.
 *
 * @param fsp - The File Share Path to check access for
 * @param userGroups - Array of groups the user belongs to
 * @returns true if the user has access, false otherwise
 */
function shouldDisplayFsp(fsp: FileSharePath, userGroups: string[]): boolean {
  return userGroups.includes(fsp.group) || fsp.group === 'public';
}

/**
 * Filters an array of File Share Paths based on user's preferences and group membership.
 * If filtering by groups is disabled in the user's preferences, all FSPs are returned.
 * If filtering by groups is enabled, only FSPs that belong to a group the user belongs to
 * (or are marked as 'public') are returned.
 *
 * @param fsps - Array of File Share Paths to filter
 * @param userGroups - Array of groups the user belongs to
 * @param isFilteredByGroups - Whether group filtering is enabled
 * @returns Filtered array of File Share Paths the user has access to
 */
export function filterFspsByGroupMembership(
  fsps: FileSharePath[],
  userGroups: string[],
  isFilteredByGroups: boolean
): FileSharePath[] {
  // If filtering is disabled or user has no groups, return all FSPs
  if (!isFilteredByGroups || userGroups.length === 0) {
    return fsps;
  }

  // Filter to only FSPs the user has access to
  return fsps.filter(fsp => shouldDisplayFsp(fsp, userGroups));
}
