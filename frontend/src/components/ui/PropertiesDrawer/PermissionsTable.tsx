import { HiCheck, HiMinus } from 'react-icons/hi';

import { FileOrFolder } from '@/shared.types';
import { parsePermissions } from '@/utils/index';

function PermissionIcon({
  hasPermission
}: {
  readonly hasPermission: boolean;
}) {
  return hasPermission ? (
    <HiCheck className="icon-default" />
  ) : (
    <HiMinus className="icon-default" />
  );
}

export default function PermissionsTable({
  file
}: {
  readonly file: FileOrFolder;
}) {
  const permissions = parsePermissions(file.permissions);

  return (
    <>
      <div className="w-full min-w-[333px] overflow-hidden rounded-lg border border-surface mt-4">
        <table className="w-full">
          <thead className="border-b border-surface bg-surface-dark text-sm">
            <tr>
              <th className="px-3 py-2 text-start font-medium">Who</th>
              <th className="px-3 py-2 text-start font-medium">Read</th>
              <th className="px-3 py-2 text-start font-medium">Write</th>
              <th className="px-3 py-2 text-start font-medium">Execute</th>
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
              <td className="p-3">
                {permissions ? (
                  <PermissionIcon hasPermission={permissions.owner.execute} />
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
              <td className="p-3">
                {permissions ? (
                  <PermissionIcon hasPermission={permissions.group.execute} />
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
              <td className="p-3">
                {permissions ? (
                  <PermissionIcon hasPermission={permissions.others.execute} />
                ) : null}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="w-full min-w-[333px] overflow-hidden rounded-lg border border-surface my-2">
        <table className="w-full">
          <thead className="border-b border-surface bg-surface-dark text-sm">
            <tr>
              <th className="px-3 py-2 text-start font-medium" colspan="2">
                Additional permissions
              </th>
            </tr>
          </thead>
          <tbody className="text-sm">
            <tr>
              <td className="p-3">Only owner can delete or rename files?</td>
              <td className="p-3">
                {permissions ? (
                  <PermissionIcon hasPermission={permissions.stickyBit} />
                ) : null}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
