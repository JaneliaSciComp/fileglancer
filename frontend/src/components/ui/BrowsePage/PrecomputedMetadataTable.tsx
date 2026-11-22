import { precomputedSummary } from '@/utils/precomputed';
import type { PrecomputedInfo } from '@/utils/precomputed';

type PrecomputedMetadataTableProps = {
  readonly precomputed: PrecomputedInfo;
};

// Shared by the file-browser preview and the Layer Cart row.
export default function PrecomputedMetadataTable({
  precomputed
}: PrecomputedMetadataTableProps) {
  return (
    <table className="bg-background/90 h-fit">
      <tbody className="text-sm">
        <tr className="h-11 border-y border-surface-dark">
          <td className="px-3 py-2 font-semibold" colSpan={2}>
            Neuroglancer Precomputed Metadata
          </td>
        </tr>
        {precomputedSummary(precomputed).map(([label, value]) => (
          <tr className="h-11 border-b border-surface-dark" key={label}>
            <td className="px-3 py-2 font-semibold">{label}</td>
            <td className="px-3 py-2">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
