import { Axis, Metadata, Multiscale } from '../../../omezarr-helper';

type ZarrMetadataTableProps = {
  metadata: Metadata;
};

function getAxesString(multiscale: Multiscale) {
  return multiscale.axes.map((axis: Axis) => axis.name.toUpperCase()).join('');
}

function getSizeString(shapes: number[][] | undefined) {
  return shapes?.[0]?.join(', ') || 'Unknown';
}

function getChunkSizeString(metadata: Metadata) {
  return metadata.arr.chunks.join(', ');
}

export default function ZarrMetadataTable({
  metadata
}: ZarrMetadataTableProps) {
  const { zarr_version, multiscale, omero, shapes } = metadata;
  return (
    <div className="flex flex-col max-h-min">
      <table className="bg-background/90">
        <tbody className="text-sm">
          <tr className="border-y border-surface-dark">
            <td className="p-3 font-semibold">Zarr Version</td>
            <td className="p-3">{zarr_version}</td>
          </tr>
          <tr className="border-b border-surface-dark">
            <td className="p-3 font-semibold">OMERO Metadata?</td>
            <td className="p-3">{omero ? 'Yes' : 'No'}</td>
          </tr>
          {multiscale?.axes ? (
            <tr className="border-b border-surface-dark">
              <td className="p-3 font-semibold">Axes</td>
              <td className="p-3">{getAxesString(multiscale)}</td>
            </tr>
          ) : null}
          {shapes ? (
            <tr className="border-b border-surface-dark">
              <td className="p-3 font-semibold">Shapes</td>
              <td className="p-3">{getSizeString(shapes)}</td>
            </tr>
          ) : null}
          {metadata.arr ? (
            <tr className="border-b border-surface-dark">
              <td className="p-3 font-semibold">Chunk Size</td>
              <td className="p-3">{getChunkSizeString(metadata)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
