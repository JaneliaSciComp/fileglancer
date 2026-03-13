import { HiExternalLink } from 'react-icons/hi';

import {
  NotificationItem,
  getNotificationStyles
} from '@/components/ui/Notifications/NotificationItem';
import logger from '@/logger';

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

  const descriptionContent = (
    <span className="inline-flex items-center gap-1">
      <span className="group-hover:underline">{description}</span>
      {href ? <HiExternalLink className="icon-xsmall flex-shrink-0" /> : null}
    </span>
  );

  const notification = (
    <NotificationItem
      notification={{ id: 0, type: kind, title, message: descriptionContent }}
      showDismissButton={false}
    />
  );

  if (href) {
    return (
      <a
        className={`${styles.container} group block p-4 rounded-md hover:brightness-95 dark:hover:brightness-125 transition-[filter]`}
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {notification}
      </a>
    );
  }

  return (
    <div className={`${styles.container} p-4 rounded-md`}>{notification}</div>
  );
}
