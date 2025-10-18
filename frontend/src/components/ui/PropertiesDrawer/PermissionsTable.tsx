import { HiCheck, HiMinus } from 'react-icons/hi';

import { FileOrFolder } from '@/shared.types';
import { parsePermissions } from '@/utils/index';

function PermissionIcon({
  hasPermission
}: {
  readonly hasPermission: boolean;
}): JSX.Element {
  return hasPermission ? (
    <HiCheck className="icon-default" />
  ) : (
    <HiMinus className="icon-default" />
  );
}

export default function PermissionsTable({
  file
}: {
  readonly file: FileOrFolder | null;
}) {
  const permissions = file ? parsePermissions(file.permissions) : null;

  return (
    <div className="w-full min-w-max overflow-hidden rounded-lg border border-surface mt-4">
      <table className="w-full min-w-max">
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
