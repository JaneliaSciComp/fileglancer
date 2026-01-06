import type { N5Metadata } from '@/queries/n5Queries';
import { translateUnitToNeuroglancer } from '@/omezarr-helper';

type N5MetadataTableProps = {
  readonly metadata: N5Metadata;
};

function formatDimensions(dimensions: number[]): string {
  return dimensions.join(', ');
}

function formatBlockSize(blockSize: number[]): string {
  return blockSize.join(', ');
}

function formatCompression(compression: {
  type: string;
  level?: number;
}): string {
  if (compression.level !== undefined) {
    return `${compression.type} (level ${compression.level})`;
  }
  return compression.type;
}

/**
 * Get axis-specific metadata for the second table
 */
function getAxisData(metadata: N5Metadata) {
  const { resolution, units, pixelResolution } = metadata.rootAttrs;
  const { dimensions } = metadata.s0Attrs;

  if (!dimensions) {
    return [];
  }

  // Assume X, Y, Z axis order for N5 (common convention)
  const axisNames = ['X', 'Y', 'Z'];

  return dimensions.map((dim, index) => {
    const axisName = axisNames[index] || `Axis ${index}`;

    // Priority: resolution -> pixelResolution.dimensions
    const res =
      resolution?.[index] ?? pixelResolution?.dimensions?.[index];

    // Determine unit for this specific axis
    // Priority: units[index] -> pixelResolution.unit -> "um"
    let axisUnit = 'um';
    if (units && units[index]) {
      axisUnit = units[index];
    } else if (pixelResolution?.unit) {
      axisUnit = pixelResolution.unit;
    }

    const displayUnit = translateUnitToNeuroglancer(axisUnit);
    const shape = dim;

    return {
      name: axisName,
      shape,
      resolution: res !== undefined ? res.toString() : 'Unknown',
      unit: displayUnit
    };
  });
}

export default function N5MetadataTable({ metadata }: N5MetadataTableProps) {
  const { rootAttrs, s0Attrs } = metadata;
  const axisData = getAxisData(metadata);

  return (
    <>
      {/* First table - General metadata */}
      <table className="bg-background/90 h-fit">
        <tbody className="text-sm">
          <tr className="h-11 border-y border-surface-dark">
            <td className="px-3 py-2 font-semibold" colSpan={2}>
              N5 Dataset Metadata
            </td>
          </tr>
          <tr className="h-11 border-y border-surface-dark">
            <td className="px-3 py-2 font-semibold">N5 Version</td>
            <td className="px-3 py-2">{rootAttrs.n5}</td>
          </tr>
          <tr className="h-11 border-b border-surface-dark">
            <td className="px-3 py-2 font-semibold">Data Type</td>
            <td className="px-3 py-2">{s0Attrs.dataType}</td>
          </tr>
          <tr className="h-11 border-b border-surface-dark">
            <td className="px-3 py-2 font-semibold">Dimensions</td>
            <td className="px-3 py-2">
              {formatDimensions(s0Attrs.dimensions)}
            </td>
          </tr>
          <tr className="h-11 border-b border-surface-dark">
            <td className="px-3 py-2 font-semibold">Block Size</td>
            <td className="px-3 py-2">{formatBlockSize(s0Attrs.blockSize)}</td>
          </tr>
          {rootAttrs.downsamplingFactors || rootAttrs.scales ? (
            <tr className="h-11 border-b border-surface-dark">
              <td className="px-3 py-2 font-semibold">Multiscale Levels</td>
              <td className="px-3 py-2">
                {rootAttrs.downsamplingFactors?.length ??
                  rootAttrs.scales?.length}
              </td>
            </tr>
          ) : null}
          <tr className="h-11 border-b border-surface-dark">
            <td className="px-3 py-2 font-semibold">Compression</td>
            <td className="px-3 py-2">
              {formatCompression(s0Attrs.compression)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Second table - Axis-specific metadata */}
      {axisData.length > 0 ? (
        <table className="bg-background/90 h-fit">
          <thead className="text-sm">
            <tr className="h-11 border-y border-surface-dark">
              <th className="px-3 py-2 font-semibold text-left">Axis</th>
              <th className="px-3 py-2 font-semibold text-left">Shape</th>
              <th className="px-3 py-2 font-semibold text-left">Resolution</th>
              <th className="px-3 py-2 font-semibold text-left">Unit</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {axisData.map(axis => (
              <tr className="h-11 border-b border-surface-dark" key={axis.name}>
                <td className="px-3 py-2 text-center">{axis.name}</td>
                <td className="px-3 py-2 text-right">{axis.shape}</td>
                <td className="px-3 py-2 text-right">{axis.resolution}</td>
                <td className="px-3 py-2 text-left">{axis.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
