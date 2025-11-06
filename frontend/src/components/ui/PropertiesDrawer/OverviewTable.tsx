import { FileOrFolder } from '@/shared.types';
import { formatUnixTimestamp, formatFileSize } from '@/utils';

export default function OverviewTable({
  file
}: {
  readonly file: FileOrFolder | null;
}) {
  return (
    <div className="w-full min-w-max overflow-hidden rounded-lg border border-surface">
      <table className="w-full min-w-max">
        <tbody className="text-sm text-nowrap">
          <tr className="border-b border-surface">
            <td className="p-3 border-b border-surface bg-surface-light text-sm text-foreground dark:bg-surface-dark font-medium">
              Type
            </td>
            <td className="p-3">
              {file ? (file.is_dir ? 'Folder' : 'File') : null}
            </td>
          </tr>
          <tr className="border-b border-surface">
            <td className="p-3 border-b border-surface bg-surface-light text-sm text-foreground dark:bg-surface-dark font-medium">
              Last modified
            </td>
            <td className="p-3">
              {file ? formatUnixTimestamp(file.last_modified) : null}
            </td>
          </tr>
          <tr className="border-b border-surface">
            <td className="p-3 border-b border-surface bg-surface-light text-sm text-foreground dark:bg-surface-dark font-medium">
              Size
            </td>
            <td className="p-3">
              {file ? (file.is_dir ? '—' : formatFileSize(file.size)) : null}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
