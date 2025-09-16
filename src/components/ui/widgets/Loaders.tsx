import { Typography } from '@material-tailwind/react';

const Spinner = ({
  customClasses,
  text
}: {
  readonly customClasses?: string;
  readonly text?: string;
}): JSX.Element => {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-5 h-5 border-4 border-surface-foreground border-t-transparent rounded-full animate-spin ${customClasses}`}
        title="Loading spinner"
      />
      <Typography type="lead">{text}</Typography>
    </div>
  );
};

const FileRowSkeleton = (): JSX.Element => {
  return (
    <div className="grid grid-cols-[minmax(170px,2fr)_minmax(80px,1fr)_minmax(95px,1fr)_minmax(75px,1fr)_minmax(40px,1fr)] gap-6 animate-appear animate-pulse animate-delay-150 opacity-0">
      {/* For div above, after specified delay, executes animate-appear to convert opacity to 1 and then let animate-pulse take over */}
      {/* Name column */}
      <div className="flex items-center pl-3 py-2">
        <div className="w-40 h-4 bg-surface rounded " />
      </div>

      {/* Type column */}
      <div className="flex items-center w-full gap-3 py-2">
        <div className="w-4 h-4 bg-surface rounded-full " />
        <div className="w-16 h-4 bg-surface rounded " />
      </div>

      {/* Last Modified column */}
      <div className="py-2 flex items-center">
        <div className="w-20 h-4 bg-surface rounded " />
      </div>

      {/* Size column */}
      <div className="py-2 flex items-center">
        <div className="w-16 h-4 bg-surface rounded " />
      </div>

      {/* Context menu button */}
      <div className="py-2 flex items-center">
        <div className="w-6 h-6 bg-surface rounded-full" />
      </div>
    </div>
  );
};

const SidebarItemSkeleton = ({
  withEndIcon
}: {
  readonly withEndIcon?: boolean;
}): JSX.Element => {
  return (
    <div className="py-2 pl-6 w-full flex items-center justify-between animate-pulse">
      <div className="flex-1 min-w-0 flex items-center gap-1">
        <div className="w-6 h-6 bg-surface rounded-full" />
        <div className="flex-1 h-4 bg-surface rounded" />
      </div>
      {withEndIcon ? <div className="w-6 h-6 bg-surface rounded-full" /> : null}
    </div>
  );
};

const TableRowSkeleton = ({
  gridColsClass,
  numberOfCols = 4
}: {
  readonly gridColsClass: string;
  readonly numberOfCols?: number;
}): JSX.Element => {
  return (
    <div
      className={`grid ${gridColsClass} justify-items-start gap-4 px-4 py-4 animate-pulse`}
    >
      {Array.from({ length: numberOfCols }).map((_, index) => (
        <div className="w-full h-4 bg-surface rounded" key={index} />
      ))}
    </div>
  );
};

export { Spinner, FileRowSkeleton, SidebarItemSkeleton, TableRowSkeleton };
