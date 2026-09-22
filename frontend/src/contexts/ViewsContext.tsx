import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import {
  useViewsQuery,
  useCreateViewMutation,
  useUpdateViewMutation,
  useDeleteViewMutation
} from '@/queries/viewQueries';

type ViewsContextType = {
  allViewsQuery: ReturnType<typeof useViewsQuery>;
  createViewMutation: ReturnType<typeof useCreateViewMutation>;
  updateViewMutation: ReturnType<typeof useUpdateViewMutation>;
  deleteViewMutation: ReturnType<typeof useDeleteViewMutation>;
};

const ViewsContext = createContext<ViewsContextType | null>(null);

export const useViewsContext = () => {
  const context = useContext(ViewsContext);
  if (!context) {
    throw new Error('useViewsContext must be used within a ViewsProvider');
  }
  return context;
};

export const ViewsProvider = ({
  children
}: {
  readonly children: ReactNode;
}) => {
  const allViewsQuery = useViewsQuery();
  const createViewMutation = useCreateViewMutation();
  const updateViewMutation = useUpdateViewMutation();
  const deleteViewMutation = useDeleteViewMutation();

  const value: ViewsContextType = {
    allViewsQuery,
    createViewMutation,
    updateViewMutation,
    deleteViewMutation
  };

  return (
    <ViewsContext.Provider value={value}>{children}</ViewsContext.Provider>
  );
};

export default ViewsContext;
