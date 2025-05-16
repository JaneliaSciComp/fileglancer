import React from 'react';
import { File } from '../../hooks/useFileBrowser';
import { formatDate, formatFileSize } from '../../utils';

type FileOverviewTableProps = {
  file: File | null;
};

export default function FileOverviewTable({ file }: FileOverviewTableProps) {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-surface mt-4">
      <table className="w-full">
        <tbody className="text-sm">
          <tr className="border-b border-surface">
            <td className="p-3 border-b border-surface bg-surface-light text-sm text-foreground dark:bg-surface-dark font-medium">
              Last modified
            </td>
            <td className="p-3 ">
              {file ? formatDate(file.last_modified) : null}
            </td>
          </tr>
          <tr className="border-b border-surface">
            <td className="p-3 border-b border-surface bg-surface-light text-sm text-foreground dark:bg-surface-dark font-medium">
              Size
            </td>
            <td className="p-3 ">
              {file ? (file.is_dir ? '—' : formatFileSize(file.size)) : null}
            </td>
          </tr>
          <tr className="border-b border-surface">
            <td className="p-3 border-b border-surface bg-surface-light text-sm text-foreground dark:bg-surface-dark font-medium">
              Metadata
            </td>
            <td className="p-3 ">Pull from file...</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
