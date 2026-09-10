import type { AxisMetadata } from '@bioimagetools/capability-manifest';
import { default as log } from '@/logger';
import {
  Metadata,
  translateUnitToNeuroglancer,
  getResolvedScales
} from '@/omezarr-helper';

type ZarrAxisTableProps = {
  readonly metadata: Metadata;
};

// Axis-specific metadata (Axes / Shape / Chunk Size / Scale / Unit). Shared by
// the file-browser Zarr metadata panel and the Layer Cart row.
function getAxisData(metadata: Metadata) {
  const { shapes, arr } = metadata;
  const multiscale = metadata.multiscales?.[0];
  if (!multiscale?.axes || !shapes?.[0] || !arr) {
    return [];
  }
  try {
    const resolvedScales = getResolvedScales(multiscale);
    return multiscale.axes.map((axis: AxisMetadata, index: number) => {
      const shape = shapes[0][index] || 'Unknown';
      const chunkSize = arr.chunks[index] || 'Unknown';
      const scale =
        resolvedScales?.[index] !== null
          ? Number.isInteger(resolvedScales[index])
            ? resolvedScales[index].toString()
            : resolvedScales[index].toFixed(4)
          : 'Unknown';
      const unit = translateUnitToNeuroglancer(axis.unit as string) || '';
      return { name: axis.name.toUpperCase(), shape, chunkSize, scale, unit };
    });
  } catch (error) {
    log.error('Error getting axis data: ', error);
    return [];
  }
}

export default function ZarrAxisTable({ metadata }: ZarrAxisTableProps) {
  const axisData = getAxisData(metadata);
  if (axisData.length === 0) {
    return null;
  }
  return (
    <table className="bg-background/90">
      <thead className="text-sm">
        <tr className="h-11 border-y border-surface-dark">
          <th className="px-3 py-2 font-semibold text-left">Axes</th>
          <th className="px-3 py-2 font-semibold text-left">Shape</th>
          <th className="px-3 py-2 font-semibold text-left">Chunk Size</th>
          <th className="px-3 py-2 font-semibold text-left">Scale</th>
          <th className="px-3 py-2 font-semibold text-left">Unit</th>
        </tr>
      </thead>
      <tbody className="text-sm">
        {axisData.map(axis => (
          <tr className="h-11 border-b border-surface-dark" key={axis.name}>
            <td className="px-3 py-2 text-center">{axis.name}</td>
            <td className="px-3 py-2 text-right">{axis.shape}</td>
            <td className="px-3 py-2 text-right">{axis.chunkSize}</td>
            <td className="px-3 py-2 text-right">{axis.scale}</td>
            <td className="px-3 py-2 text-left">{axis.unit}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
