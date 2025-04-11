import React from 'react';
import { CheckIcon, MinusIcon } from '@heroicons/react/24/outline';
import { File } from '../../shared.types';

type FileTableProps = {
  file: File | null;
};

export default function FilePermissionTable({ file }: FileTableProps) {
  // Parse the Unix-style permissions string (e.g., "drwxr-xr-x")
  const parsePermissions = (permissionString: string) => {
    // Owner permissions (positions 1-3)
    const ownerRead = permissionString[1] === 'r';
    const ownerWrite = permissionString[2] === 'w';

    // Group permissions (positions 4-6)
    const groupRead = permissionString[4] === 'r';
    const groupWrite = permissionString[5] === 'w';

    // Others/everyone permissions (positions 7-9)
    const othersRead = permissionString[7] === 'r';
    const othersWrite = permissionString[8] === 'w';

    return {
      owner: { read: ownerRead, write: ownerWrite },
      group: { read: groupRead, write: groupWrite },
      others: { read: othersRead, write: othersWrite }
    };
  };

  const permissions = file ? parsePermissions(file.permissions) : null;

  const PermissionIcon = ({ hasPermission }: { hasPermission: boolean }) =>
    hasPermission ? (
      <CheckIcon className="h-5 w-5" />
    ) : (
      <MinusIcon className="h-5 w-5" />
    );

  return (
    <div className="w-full overflow-hidden rounded-lg border border-surface mt-4">
      <table className="w-full">
        <thead className="border-b border-surface bg-surface-dark text-sm font-medium">
          <tr>
            <th className="px-3 py-2 text-start font-medium">
              Who can view or edit this data?
            </th>
            <th className="px-3 py-2 text-center font-medium">Read</th>
            <th className="px-3 py-2 text-center font-medium">Write</th>
          </tr>
        </thead>
        <tbody className="text-sm">
          <tr className="border-b border-surface">
            <td className="p-3 font-medium">
              Owner: {file ? file.owner : null}
            </td>
            <td className="p-3">
              {permissions ? (
                <PermissionIcon hasPermission={permissions.owner.read} />
              ) : null}
            </td>
            <td className="p-3">
              {permissions ? (
                <PermissionIcon hasPermission={permissions.owner.write} />
              ) : null}
            </td>
          </tr>
          <tr className="border-b border-surface">
            <td className="p-3 font-medium">
              Group: {file ? file.group : null}
            </td>
            <td className="p-3">
              {permissions ? (
                <PermissionIcon hasPermission={permissions.group.read} />
              ) : null}
            </td>
            <td className="p-3">
              {permissions ? (
                <PermissionIcon hasPermission={permissions.group.write} />
              ) : null}
            </td>
          </tr>
          <tr>
            <td className="p-3 font-medium">Everyone else</td>
            <td className="p-3">
              {permissions ? (
                <PermissionIcon hasPermission={permissions.others.read} />
              ) : null}
            </td>
            <td className="p-3">
              {permissions ? (
                <PermissionIcon hasPermission={permissions.others.write} />
              ) : null}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
