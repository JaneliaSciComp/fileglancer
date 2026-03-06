import {
  NotificationItem,
  getNotificationStyles
} from '@/components/ui/Notifications/NotificationItem';

type MetadataHintVariant =
  // Zarr - query never fired
  | { case: 'zarr-extension-no-markers' }
  // Zarr - query fired but no multiscales
  | { case: 'zarr-v2-no-multiscales' }
  | { case: 'zarr-v3-no-multiscales' }
  | { case: 'zarr-query-error'; errorMessage?: string }
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
};

function getHintConfig(variant: MetadataHintVariant): HintConfig {
  switch (variant.case) {
    case 'zarr-extension-no-markers':
      return {
        kind: 'info',
        title: 'Zarr preview unavailable',
        description:
          'This folder has a .zarr extension but does not contain one of these Zarr marker files: zarr.json (v3), .zarray (v2 array), or .zattrs (v2 group).'
      };
    case 'zarr-v2-no-multiscales':
      return {
        kind: 'info',
        title: 'Zarr preview unavailable',
        description:
          'A .zattrs file was found but it has no multiscales field. To preview as OME-Zarr, add multiscales to .zattrs. To preview as a plain array, use .zarray instead.'
      };
    case 'zarr-v3-no-multiscales':
      return {
        kind: 'info',
        title: 'Zarr preview unavailable',
        description:
          'A zarr.json group was found but it has no attributes.ome.multiscales field required for OME-Zarr v3.'
      };
    case 'zarr-query-error':
      return {
        kind: 'warning',
        title: 'Error loading Zarr metadata',
        description: variant.errorMessage
          ? `Could not read Zarr metadata. ${variant.errorMessage}`
          : 'Could not read Zarr metadata.'
      };
    // N5
    case 'n5-has-s0-no-attrs':
      return {
        kind: 'info',
        title: 'N5 preview unavailable',
        description:
          'This folder has a .n5 extension but does not contain an attributes.json file required for N5 metadata preview.'
      };
    case 'n5-has-attrs-no-s0':
      return {
        kind: 'info',
        title: 'N5 preview unavailable',
        description:
          'This folder has a .n5 extension but does not contain an s0/ folder required for N5 metadata preview.'
      };
    case 'n5-no-markers':
      return {
        kind: 'info',
        title: 'N5 preview unavailable',
        description:
          'This folder has a .n5 extension but does not contain an s0/ folder or attributes.json file required for N5 metadata preview.'
      };
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
  const { kind, title, description } = getHintConfig(variant);
  const styles = getNotificationStyles(kind);

  return (
    <div className={`${styles.container} p-4 rounded-md`}>
      <NotificationItem
        notification={{ id: 0, type: kind, title, message: description }}
        showDismissButton={false}
      />
    </div>
  );
}
