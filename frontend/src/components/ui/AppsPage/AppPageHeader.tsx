import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { IconButton, Typography } from '@material-tailwind/react';
import { HiOutlineArrowLeft } from 'react-icons/hi';
import type { IconType } from 'react-icons';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgTooltip from '@/components/ui/widgets/FgTooltip';

interface AppPageHeaderProps {
  readonly title?: string;
  readonly icon?: IconType;
  readonly backTo?: string;
  readonly backLabel?: string;
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
}

/**
 * Header for apps sub-pages (app detail, launch): a back arrow followed by the
 * app icon and name, with an optional badge (`children`) and a right-aligned
 * `actions` slot.
 */
export default function AppPageHeader({
  title,
  icon,
  backTo = '/apps',
  backLabel = 'Back to My Apps',
  actions,
  children
}: AppPageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <FgTooltip label={backLabel}>
          <IconButton
            aria-label={backLabel}
            className="text-foreground hover:text-primary flex-shrink-0"
            onClick={() => navigate(backTo)}
            size="sm"
            variant="ghost"
          >
            <FgIcon icon={HiOutlineArrowLeft} />
          </IconButton>
        </FgTooltip>
        {icon ? (
          <FgIcon className="text-foreground flex-shrink-0" icon={icon} />
        ) : null}
        <Typography className="text-foreground font-bold truncate" type="h6">
          {title}
        </Typography>
        {children}
      </div>
      {actions ? (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      ) : null}
    </div>
  );
}
