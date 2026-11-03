import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { IconButton, Typography } from '@material-tailwind/react';
import { HiOutlineArrowLeft } from 'react-icons/hi';
import { TbBrandGithub } from 'react-icons/tb';
import type { IconType } from 'react-icons';

import FgExternalLink from '@/components/designSystem/atoms/FgExternalLink';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import MarkdownText from '@/components/ui/MarkdownText';

interface AppPageHeaderProps {
  readonly title?: ReactNode;
  readonly icon?: IconType;
  readonly description?: string | null;
  readonly githubUrl?: string | null;
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
  description,
  githubUrl,
  backTo = '/apps',
  backLabel = 'Back to My Apps',
  actions,
  children
}: AppPageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3 pb-5">
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
          {typeof title === 'string' ? (
            <Typography
              className="text-foreground font-bold truncate"
              type="h6"
            >
              {title}
            </Typography>
          ) : (
            title
          )}
          {children}
        </div>
        {actions ? (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        ) : null}
      </div>
      <MarkdownText className="text-sm" text={description} />
      {githubUrl ? (
        <div className="mt-3 flex items-center gap-1.5 text-foreground">
          <FgIcon className="shrink-0" icon={TbBrandGithub} size="sm" />
          <FgExternalLink
            className="break-all"
            href={githubUrl}
            showIcon={false}
            size="sm"
          >
            {githubUrl}
          </FgExternalLink>
        </div>
      ) : null}
    </div>
  );
}
