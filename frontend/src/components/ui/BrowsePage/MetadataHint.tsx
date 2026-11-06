import {
  NotificationItem,
  getNotificationStyles
} from '@/components/ui/Notifications/NotificationItem';
import FgExternalLink from '@/components/designSystem/atoms/FgExternalLink';
import logger from '@/logger';

type MetadataHintVariant =
  // Zarr - query never fired
  | { case: 'zarr-extension-no-markers' }
  // Zarr - query fired but no multiscales
  | { case: 'zarr-v2-no-multiscales' }
  | { case: 'zarr-v3-no-multiscales' }
  | { case: 'zarr-query-error'; errorMessage?: string }
  // Zarr - an image file served as virtual OME-Zarr by zarrbridge
  | { case: 'virtual-zarr'; state?: string }
  // Zarr - metadata is valid, but the layout will make viewing awkward
  | { case: 'zarr-single-level'; size: string }
  | {
      case: 'zarr-large-chunks';
      size: string;
      compressed: boolean;
      sharded: boolean;
    }
  // N5 - query never fired
  | { case: 'n5-has-s0-no-attrs' }
  | { case: 'n5-has-attrs-no-s0' }
  | { case: 'n5-no-markers' }
  | { case: 'n5-query-error'; errorMessage?: string };

interface MetadataHintProps {
  readonly variant: MetadataHintVariant;
}

type HintConfig = {
  kind: 'info' | 'warning';
  title: string;
  description: string;
  href?: string;
};

const zarrHint: HintConfig = {
  kind: 'info',
  title:
    'Need help previewing your Zarr metadata or making a data link for an external viewer?',
  description:
    'Read about Zarr data structure and metadata requirements in the help docs.',
  href: 'https://fileglancer-docs.janelia.org/features/image-support/#when-the-zarr-preview-panel-appears'
};

const n5Hint: HintConfig = {
  kind: 'info',
  title:
    'Need help previewing your N5 metadata or making a data link for an external viewer?',
  description:
    'Read about N5 data structure and metadata requirements in the help docs.',
  href: 'https://fileglancer-docs.janelia.org/features/image-support/#when-the-n5-preview-panel-appears'
};

function virtualZarrDescription(state: string | undefined): string {
  switch (state) {
    case 'multiscale':
      return `This image file is served as OME-Zarr without conversion. A multiscale pyramid is cached beside it, so viewers can zoom out quickly.`;
    case 'indexing':
    case 'queued':
    case 'building':
      return `This image file is served as OME-Zarr without conversion. A multiscale pyramid is being built in the background; until it is done, viewers read full resolution at every zoom level.`;
    case 'failed':
    case 'unservable':
      return `This image file is served as OME-Zarr without conversion, but no multiscale pyramid could be built (${state}). Viewers read full resolution at every zoom level.`;
    default:
      return `This image file is served as OME-Zarr without conversion. Only the native resolution is available, so viewers read full resolution at every zoom level.`;
  }
}

function getHintConfig(variant: MetadataHintVariant): HintConfig {
  switch (variant.case) {
    case 'zarr-extension-no-markers':
      logger.info(
        'This folder has a .zarr extension but does not contain one of these Zarr marker files: zarr.json (v3), .zarray (v2 array), or .zattrs (v2 group).'
      );
      return zarrHint;
    case 'zarr-v2-no-multiscales':
      logger.info(
        'A .zattrs file was found but it has no multiscales field. To preview as OME-Zarr, add multiscales to .zattrs. To preview as a plain array, use .zarray instead.'
      );
      return zarrHint;
    case 'zarr-v3-no-multiscales':
      logger.info(
        'A zarr.json group was found but it has no attributes.ome.multiscales field required for OME-Zarr v3.'
      );
      return zarrHint;
    case 'zarr-query-error':
      return {
        kind: 'warning',
        title: 'Error loading Zarr metadata',
        description: variant.errorMessage
          ? `Could not read Zarr metadata. ${variant.errorMessage}`
          : 'Could not read Zarr metadata.'
      };
    case 'virtual-zarr':
      return {
        kind: 'info',
        title: 'Virtual OME-Zarr',
        description: virtualZarrDescription(variant.state)
      };
    case 'zarr-single-level':
      return {
        kind: 'warning',
        title: 'Only one resolution level',
        description: `This dataset declares multiscales but only supplies a single level, for ${variant.size} of data. Without multiple levels, viewers read the full-resolution data at every zoom level, making viewing slow. Generating a multiscale pyramid fixes this.`
      };
    case 'zarr-large-chunks':
      return {
        kind: 'warning',
        title: 'Chunks may be too large for efficient viewing',
        description: `This dataset uses ${variant.size} ${variant.sharded ? 'inner chunks' : 'chunks'} ${variant.compressed ? '(before compression)' : '(without compression)'}. Very large chunks make viewing slow, because a viewer must fetch a whole chunk to show any part of it. A stored chunk size of 1-32 MB works best.`
      };
    case 'n5-has-s0-no-attrs':
      logger.info(
        'This folder has a .n5 extension but does not contain an attributes.json file required for N5 metadata preview.'
      );
      return n5Hint;
    case 'n5-has-attrs-no-s0':
      logger.info(
        'This folder has a .n5 extension but does not contain an s0/ folder required for N5 metadata preview.'
      );
      return n5Hint;
    case 'n5-no-markers':
      logger.info(
        'This folder has a .n5 extension but does not contain an s0/ folder or attributes.json file required for N5 metadata preview.'
      );
      return n5Hint;
    case 'n5-query-error':
      return {
        kind: 'warning',
        title: 'Error loading N5 metadata',
        description: variant.errorMessage
          ? `Could not read N5 metadata. s0/attributes.json may be missing or unreadable. ${variant.errorMessage}`
          : 'Could not read N5 metadata. s0/attributes.json may be missing or unreadable.'
      };
  }
}

export default function MetadataHint({ variant }: MetadataHintProps) {
  const { kind, title, description, href } = getHintConfig(variant);
  const styles = getNotificationStyles(kind);

  // Only the description is a link, so the rest of the box stays selectable.
  const message = href ? (
    <FgExternalLink href={href} size="sm">
      {description}
    </FgExternalLink>
  ) : (
    description
  );

  return (
    <div className={`${styles.container} p-4 mb-3 rounded-md`}>
      <NotificationItem
        notification={{ id: 0, type: kind, title, message }}
        showDismissButton={false}
      />
    </div>
  );
}
