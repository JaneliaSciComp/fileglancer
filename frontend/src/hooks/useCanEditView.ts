import { useViewsContext } from '@/contexts/ViewsContext';
import type { View } from '@/queries/viewQueries';

/**
 * The one client-side answer to "may this user edit the View with this read
 * key?" (mirrors the server's _can_edit_view). Today: the View is in the
 * user's own Views list. Edit links extend this later.
 */
export function useCanEditView(readKey: string | undefined): {
  canEdit: boolean;
  view: View | undefined;
} {
  const { allViewsQuery } = useViewsContext();
  const view = allViewsQuery.data?.find(v => v.read_key === readKey);
  return { canEdit: view !== undefined, view };
}
