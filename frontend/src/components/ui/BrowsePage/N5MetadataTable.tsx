import { HiExclamationTriangle } from 'react-icons/hi2';

import FgTooltip from '@/components/ui/widgets/FgTooltip';
import { translateUnitToNeuroglancer } from '@/omezarr-helper';
import type { N5Metadata } from '@/queries/n5Queries';

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
    const res = resolution?.[index] ?? pixelResolution?.dimensions?.[index];

    // Priority: units[index] -> pixelResolution.unit -> '' (not specified)
    const rawUnit = units?.[index] || pixelResolution?.unit || '';
    const displayUnit = rawUnit ? translateUnitToNeuroglancer(rawUnit) : '';
    const shape = dim;

    return {
      name: axisName,
      shape,
      resolution: res !== undefined ? res.toString() : 'Unknown',
      unit: displayUnit
    };
  });
}

export function getN5MissingAttributeHints(metadata: N5Metadata): string[] {
  const hints: string[] = [];
  const { resolution, pixelResolution, units, downsamplingFactors, scales } =
    metadata.rootAttrs;

  if (!resolution && !pixelResolution?.dimensions) {
    hints.push('n5-no-resolution');
  }

  if ((!units || units.length === 0) && !pixelResolution?.unit) {
    hints.push('n5-no-units');
  }

  if (!downsamplingFactors && !scales) {
    hints.push('n5-no-downsampling');
  }

  return hints;
}

export default function N5MetadataTable({ metadata }: N5MetadataTableProps) {
  const { rootAttrs, s0Attrs } = metadata;
  const hints = getN5MissingAttributeHints(metadata);
  const hasNoResolution = hints.includes('n5-no-resolution');
  const hasNoUnits = hints.includes('n5-no-units');
  const hasNoDownsampling = hints.includes('n5-no-downsampling');
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
          <tr className="h-11 border-b border-surface-dark">
            <td className="px-3 py-2 font-semibold">Multiscale Levels</td>
            {hasNoDownsampling ? (
              <td className="px-3 py-3 flex items-center gap-1 text-warning">
                Not specified
                <FgTooltip
                  icon={HiExclamationTriangle}
                  label="No 'downsamplingFactors' or 'scales' found in attributes.json. Neuroglancer can also read 'downsamplingFactors' from individual sN/attributes.json files."
                />
              </td>
            ) : (
              <td className="px-3 py-2">
                {rootAttrs.downsamplingFactors?.length ??
                  rootAttrs.scales?.length}
              </td>
            )}
          </tr>
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

                {hasNoResolution && axis.resolution === 'Unknown' ? (
                  <td className="px-3 py-3 text-right">
                    <span className="flex items-center justify-end gap-1 text-warning">
                      {axis.resolution}
                      <FgTooltip
                        icon={HiExclamationTriangle}
                        label="No 'resolution' or 'pixelResolution.dimensions' found in attributes.json. Neuroglancer uses these to define the physical scale of each dimension."
                      />
                    </span>
                  </td>
                ) : (
                  <td className="px-3 py-2 text-right">{axis.resolution}</td>
                )}

                <td className="px-3 py-2 text-left">
                  <span className="flex items-center gap-1">
                    {axis.unit}
                    {hasNoUnits ? (
                      <FgTooltip
                        icon={HiExclamationTriangle}
                        label="No 'units' or 'pixelResolution.unit' found in attributes.json. Viewers may assume a default unit when none is specified."
                      />
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
