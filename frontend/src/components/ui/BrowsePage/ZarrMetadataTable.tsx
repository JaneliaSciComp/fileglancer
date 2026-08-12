import * as zarr from 'zarrita';
import { HiQuestionMarkCircle } from 'react-icons/hi';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { Metadata } from '@/omezarr-helper';
import FgLink from '@/components/designSystem/atoms/FgLink';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import ZarrAxisTable from '@/components/ui/BrowsePage/ZarrAxisTable';

type ZarrMetadataTableProps = {
  readonly metadata: Metadata;
  readonly layerType: 'auto' | 'image' | 'segmentation' | null;
  readonly availableZarrVersions?: number[];
};

function getSizeString(shapes: number[][] | undefined) {
  return shapes?.[0]?.join(', ') || 'Unknown';
}

function getChunkSizeString(arr: zarr.Array<any>) {
  return arr.chunks.join(', ');
}

export default function ZarrMetadataTable({
  metadata,
  layerType,
  availableZarrVersions
}: ZarrMetadataTableProps) {
  const { disableHeuristicalLayerTypeDetection } = usePreferencesContext();
  const { zarrVersion, shapes } = metadata;
  const multiscale = metadata.multiscales?.[0];

  return (
    <>
      {/* First table - General metadata */}
      <table className="bg-background/90">
        <tbody className="text-sm">
          <tr className="h-11 border-y border-surface-dark">
            <td className="px-3 py-2 font-semibold" colSpan={2}>
              {multiscale ? 'OME-Zarr Metadata' : 'Zarr Array Metadata'}
            </td>
          </tr>
          <tr className="h-11 border-y border-surface-dark">
            <td className="px-3 py-2 font-semibold">Zarr Version</td>
            <td className="px-3 py-2">
              {availableZarrVersions && availableZarrVersions.length > 0
                ? availableZarrVersions.join(', ')
                : zarrVersion}
            </td>
          </tr>
          <tr className="h-11 border-b border-surface-dark">
            <td className="px-3 py-2 font-semibold">Content (auto-detected)</td>
            {disableHeuristicalLayerTypeDetection ? (
              <td className="px-3 py-3 capitalize flex items-center gap-1">
                Disabled
                <FgTooltip
                  icon={HiQuestionMarkCircle}
                  interactiveLabel={
                    <>
                      Heuristical layer type detection is disabled in{' '}
                      <FgLink to="/preferences">preferences</FgLink>.
                    </>
                  }
                  isInteractive={true}
                  label="Heuristical layer type detection is disabled in preferences"
                />
              </td>
            ) : layerType ? (
              <td className="px-3 py-2 capitalize">{layerType}</td>
            ) : null}
          </tr>
          {metadata.arr ? (
            <tr className="h-11 border-b border-surface-dark">
              <td className="px-3 py-2 font-semibold">Data Type</td>
              <td className="px-3 py-2">{metadata.arr.dtype}</td>
            </tr>
          ) : null}
          {!multiscale && shapes ? (
            <tr className="h-11 border-b border-surface-dark">
              <td className="px-3 py-2 font-semibold">Shape</td>
              <td className="px-3 py-2">{getSizeString(shapes)}</td>
            </tr>
          ) : null}
          {!multiscale && metadata.arr ? (
            <tr className="h-11 border-b border-surface-dark">
              <td className="px-3 py-2 font-semibold">Chunk Size</td>
              <td className="px-3 py-2">{getChunkSizeString(metadata.arr)}</td>
            </tr>
          ) : null}
          {multiscale && shapes ? (
            <tr className="h-11 border-b border-surface-dark">
              <td className="px-3 py-2 font-semibold">Multiscale Levels</td>
              <td className="px-3 py-2">{shapes.length}</td>
            </tr>
          ) : null}
          {metadata.labels && metadata.labels.length > 0 ? (
            <tr className="h-11 border-b border-surface-dark">
              <td className="px-3 py-2 font-semibold">Labels</td>
              <td className="px-3 py-2">{metadata.labels.join(', ')}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {/* Second table - Axis-specific metadata */}
      <ZarrAxisTable metadata={metadata} />
    </>
  );
}
