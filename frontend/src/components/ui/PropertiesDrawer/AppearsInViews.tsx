import { Typography } from '@material-tailwind/react';
import { Link } from 'react-router';

import {
  useViewsForDataLinkQuery,
  useViewsForDatasetQuery
} from '@/queries/viewQueries';

// A Data Link's list, or a dataset's (fspName + path) when it has no Data Link
type AppearsInViewsProps =
  | {
      readonly sharingKey: string;
      readonly fspName?: never;
      readonly path?: never;
    }
  | {
      readonly sharingKey?: never;
      readonly fspName: string;
      readonly path: string;
    };

export default function AppearsInViews({
  sharingKey,
  fspName,
  path
}: AppearsInViewsProps) {
  const dataLinkQuery = useViewsForDataLinkQuery(sharingKey);
  const datasetQuery = useViewsForDatasetQuery(fspName, path);
  // The unused query is disabled, and a disabled query stays pending
  const viewsQuery = sharingKey ? dataLinkQuery : datasetQuery;

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
      <ul className="list-disc pl-5">
        {views.map(v => (
          <li className="text-sm truncate" key={v.short_key}>
            <Link
              className="text-primary hover:underline"
              to={`/view/${v.read_key}`}
            >
              {v.name || v.short_key}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
