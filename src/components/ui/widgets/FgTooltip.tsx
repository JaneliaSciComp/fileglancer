import { Tooltip, Typography } from '@material-tailwind/react';

type FgTooltipProps = {
  readonly as?: React.ElementType;
  readonly variant?: 'outline' | 'ghost';
  readonly link?: string;
  readonly disabledCondition?: boolean;
  readonly onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  readonly icon?: React.ElementType;
  readonly label: string;
  readonly triggerClasses?: string;
  readonly openCondition?: boolean;
  readonly children?: React.ReactNode;
};

export default function FgTooltip({
  as,
  variant,
  link,
  disabledCondition,
  onClick,
  icon,
  label,
  triggerClasses,
  openCondition,
  children
}: FgTooltipProps) {
  const Component = as || null;
  const Icon = icon || null;

  return (
    <Tooltip open={openCondition} placement="top">
      <Tooltip.Trigger
        as={Component}
        className={triggerClasses || ''}
        disabled={Boolean(disabledCondition || false)}
        onClick={onClick ? onClick : undefined}
        to={link}
        variant={variant || null}
      >
        {Icon ? <Icon className="icon-default" /> : null}
        {children}
        <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground z-10">
          <Typography className="opacity-90" type="small">
            {label}
          </Typography>
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Trigger>
    </Tooltip>
  );
}
