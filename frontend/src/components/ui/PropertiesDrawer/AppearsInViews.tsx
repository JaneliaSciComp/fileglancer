import { Typography } from '@material-tailwind/react';

import { useViewsForDataLinkQuery } from '@/queries/viewQueries';

interface AppearsInViewsProps {
  readonly sharingKey: string;
}

export default function AppearsInViews({ sharingKey }: AppearsInViewsProps) {
  const viewsQuery = useViewsForDataLinkQuery(sharingKey);

  // Stay quiet while loading / on error / when unused — this is a
  // supplementary read-only hint, not a primary control.
  if (viewsQuery.isPending || viewsQuery.isError) {
    return null;
  }
  const views = viewsQuery.data ?? [];
  if (views.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 pt-2">
      <Typography className="text-foreground font-semibold" type="small">
        Appears in {views.length} View{views.length === 1 ? '' : 's'}
      </Typography>
      {/* ponytail: names only, not links — PR 6 makes View names
      navigable to the embedded viewer; a link to nowhere now is worse
      than plain text. */}
      <ul className="list-disc pl-5">
        {views.map(v => (
          <li className="text-foreground text-sm truncate" key={v.short_key}>
            {v.name || v.short_key}
          </li>
        ))}
      </ul>
    </div>
  );
}
