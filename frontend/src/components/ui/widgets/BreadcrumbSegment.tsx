import {
  BreadcrumbLink,
  BreadcrumbSeparator,
  Typography
} from '@material-tailwind/react';
import { HiMiniSlash } from 'react-icons/hi2';

import { FgStyledLink } from '@/components/ui/widgets/FgLink';

type BreadcrumbSegmentProps = {
  readonly label: string;
  readonly isLast: boolean;
  readonly isFile?: boolean;
  readonly pathPreference: string[];
  readonly to?: string;
  readonly onClick?: () => void;
};

/**
 * Shared breadcrumb segment component for consistent styling across
 * Crumbs and FileSelectorBreadcrumbs components.
 */
export default function BreadcrumbSegment({
  label,
  isLast,
  isFile = false,
  pathPreference,
  to,
  onClick
}: BreadcrumbSegmentProps) {
  if (isLast) {
    // Last segment is always non-clickable text
    return (
      <Typography
        className={`font-medium text-foreground ${isFile ? 'italic' : ''}`}
      >
        {label}
      </Typography>
    );
  }

  // Non-last segments are clickable links/buttons with separators
  return (
    <>
      {to ? (
        // React Router navigation
        <BreadcrumbLink as={FgStyledLink} to={to}>
          <Typography
            className="font-medium text-primary-light"
            variant="small"
          >
            {label}
          </Typography>
        </BreadcrumbLink>
      ) : (
        // Callback-based navigation (for dialogs)
        <BreadcrumbLink as="button" onClick={onClick}>
          <Typography
            className="font-medium text-primary-light hover:underline focus:underline"
            variant="small"
          >
            {label}
          </Typography>
        </BreadcrumbLink>
      )}
      <BreadcrumbSeparator>
        {pathPreference[0] === 'windows_path' ? (
          <HiMiniSlash className="icon-default transform scale-x-[-1]" />
        ) : (
          <HiMiniSlash className="icon-default" />
        )}
      </BreadcrumbSeparator>
    </>
  );
}
