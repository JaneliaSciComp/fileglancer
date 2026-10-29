import type { ReactNode } from 'react';
import { Typography } from '@material-tailwind/react';
import { HiChevronRight } from 'react-icons/hi';
import { HiOutlineSquares2X2 } from 'react-icons/hi2';
import { TbBrandGithub } from 'react-icons/tb';
import type { IconType } from 'react-icons';

import FgExternalLink from '@/components/designSystem/atoms/FgExternalLink';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgLink from '@/components/designSystem/atoms/FgLink';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import InlineNameEditor from '@/components/ui/widgets/InlineNameEditor';

interface AppBreadcrumbsProps {
  /** Link target for the leading apps-home icon (My Apps or the Catalog). */
  readonly homeTo: string;
  /** Accessible/tooltip label for the home icon. */
  readonly homeLabel: string;
  /** App name segment; omitted while the manifest is still loading. */
  readonly appName?: string;
  /** When set, the app name links to the app/listing detail page. */
  readonly appTo?: string;
  /** When set (and appTo isn't), the app name is editable in place. */
  readonly onRenameApp?: (name: string) => Promise<void>;
  /** Entry-point segment (the current, non-clickable leaf). */
  readonly entryPointName?: string;
  readonly entryPointIcon?: IconType;
  /** Right-aligned actions (e.g. the launch button). */
  readonly actions?: ReactNode;
  readonly description?: string | null;
  readonly githubUrl?: string | null;
  /** Trailing content next to the trail, e.g. a "Shared" badge. */
  readonly children?: ReactNode;
}

function Separator() {
  return (
    <FgIcon
      className="text-foreground/50 flex-shrink-0"
      icon={HiChevronRight}
      size="sm"
    />
  );
}

/**
 * Breadcrumb header for the app launch page, styled like the file-browser
 * breadcrumbs: a leading apps-home icon that returns to the top apps page,
 * followed by `›`-delimited segments for the app and the selected entry point.
 * Description and GitHub URL render below, mirroring AppPageHeader.
 */
export default function AppBreadcrumbs({
  homeTo,
  homeLabel,
  appName,
  appTo,
  onRenameApp,
  entryPointName,
  entryPointIcon,
  actions,
  description,
  githubUrl,
  children
}: AppBreadcrumbsProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3 pb-5">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 min-w-0"
        >
          <FgTooltip label={homeLabel}>
            <FgLink className="flex items-center flex-shrink-0" to={homeTo}>
              <FgIcon
                className="text-primary-dark"
                icon={HiOutlineSquares2X2}
              />
              <span className="sr-only">{homeLabel}</span>
            </FgLink>
          </FgTooltip>

          {appName ? (
            <>
              <Separator />
              {appTo ? (
                <FgLink className="truncate min-w-0" size="sm" to={appTo}>
                  {appName}
                </FgLink>
              ) : onRenameApp ? (
                <InlineNameEditor
                  className="font-medium text-foreground truncate"
                  label="app name"
                  onSave={onRenameApp}
                  typographyType="p"
                  value={appName}
                />
              ) : (
                <Typography
                  className="font-medium text-foreground truncate"
                  variant="small"
                >
                  {appName}
                </Typography>
              )}
            </>
          ) : null}

          {entryPointName ? (
            <>
              <Separator />
              {entryPointIcon ? (
                <FgIcon
                  className="text-foreground flex-shrink-0"
                  icon={entryPointIcon}
                  size="sm"
                />
              ) : null}
              <Typography
                className="font-medium text-foreground truncate"
                variant="small"
              >
                {entryPointName}
              </Typography>
            </>
          ) : null}

          {children}
        </nav>
        {actions ? (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        ) : null}
      </div>
      {description ? (
        <Typography className="text-foreground" type="small">
          {description}
        </Typography>
      ) : null}
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
