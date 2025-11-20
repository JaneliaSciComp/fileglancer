import * as zarr from 'zarrita';
import { Axis } from 'ome-zarr.js';
import {
  Metadata,
  translateUnitToNeuroglancer,
  getResolvedScales
} from '../../../omezarr-helper';

type ZarrMetadataTableProps = {
  readonly metadata: Metadata;
  readonly layerType: 'auto' | 'image' | 'segmentation' | null;
  readonly availableVersions?: ('v2' | 'v3')[];
};

function getSizeString(shapes: number[][] | undefined) {
  return shapes?.[0]?.join(', ') || 'Unknown';
}

function getChunkSizeString(arr: zarr.Array<any>) {
  return arr.chunks.join(', ');
}

/**
 * Get axis-specific metadata for creating the second table
 * @param metadata - The Zarr metadata
 * @returns Array of axis data with name, shape, chunk size, scale, and unit
 */
function getAxisData(metadata: Metadata) {
  const { multiscale, shapes, arr } = metadata;
  if (!multiscale?.axes || !shapes?.[0] || !arr) {
    return [];
  }
  try {
    const resolvedScales = getResolvedScales(multiscale);

    return multiscale.axes.map((axis: Axis, index: number) => {
      const shape = shapes[0][index] || 'Unknown';
      const chunkSize = arr.chunks[index] || 'Unknown';

      const scale =
        resolvedScales?.[index] !== null
          ? Number.isInteger(resolvedScales[index])
            ? resolvedScales[index].toString()
            : resolvedScales[index].toFixed(4)
          : 'Unknown';
      const unit = translateUnitToNeuroglancer(axis.unit as string) || '';

      return {
        name: axis.name.toUpperCase(),
        shape,
        chunkSize,
        scale,
        unit
      };
    });
  } catch (error) {
    console.error('Error getting axis data: ', error);
    return [];
  }
}

export default function ZarrMetadataTable({
  metadata,
  layerType,
  availableVersions
}: ZarrMetadataTableProps) {
  const { zarrVersion, multiscale, shapes } = metadata;
  const axisData = getAxisData(metadata);

  return (
    <div className="flex flex-col gap-4 max-h-min">
      {/* First table - General metadata */}
      <table className="bg-background/90">
        <tbody className="text-sm">
          <tr className="border-y border-surface-dark">
            <td className="p-3 font-semibold" colSpan={2}>
              {multiscale ? 'OME-Zarr Metadata' : 'Zarr Array Metadata'}
            </td>
          </tr>
          <tr className="border-y border-surface-dark">
            <td className="p-3 font-semibold">Zarr Version</td>
            <td className="p-3">
              {availableVersions && availableVersions.length > 1
                ? availableVersions.join(', ')
                : zarrVersion}
            </td>
          </tr>
          {layerType ? (
            <tr className="border-b border-surface-dark">
              <td className="p-3 font-semibold">Content (auto-detected)</td>
              <td className="p-3 capitalize">{layerType}</td>
            </tr>
          ) : null}
          {metadata.arr ? (
            <tr className="border-b border-surface-dark">
              <td className="p-3 font-semibold">Data Type</td>
              <td className="p-3">{metadata.arr.dtype}</td>
            </tr>
          ) : null}
          {!metadata.multiscale && shapes ? (
            <tr className="border-b border-surface-dark">
              <td className="p-3 font-semibold">Shape</td>
              <td className="p-3">{getSizeString(shapes)}</td>
            </tr>
          ) : null}
          {!metadata.multiscale && metadata.arr ? (
            <tr className="border-b border-surface-dark">
              <td className="p-3 font-semibold">Chunk Size</td>
              <td className="p-3">{getChunkSizeString(metadata.arr)}</td>
            </tr>
          ) : null}
          {metadata.multiscale && shapes ? (
            <tr className="border-b border-surface-dark">
              <td className="p-3 font-semibold">Multiscale Levels</td>
              <td className="p-3">{shapes.length}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {/* Second table - Axis-specific metadata */}
      {axisData?.length > 0 ? (
        <table className="bg-background/90">
          <thead className="text-sm">
            <tr className="border-y border-surface-dark">
              <th className="p-3 font-semibold text-left">Axes</th>
              <th className="p-3 font-semibold text-left">Shape</th>
              <th className="p-3 font-semibold text-left">Chunk Size</th>
              <th className="p-3 font-semibold text-left">Scale</th>
              <th className="p-3 font-semibold text-left">Unit</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {axisData.map((axis, index) => (
              <tr className="border-b border-surface-dark" key={axis.name}>
                <td className="p-3 text-center">{axis.name}</td>
                <td className="p-3 text-right">{axis.shape}</td>
                <td className="p-3 text-right">{axis.chunkSize}</td>
                <td className="p-3 text-right">{axis.scale}</td>
                <td className="p-3 text-left">{axis.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
