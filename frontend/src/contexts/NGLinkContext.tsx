import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import {
  useNGLinksQuery,
  useCreateNGLinkMutation,
  useUpdateNGLinkMutation,
  useDeleteNGLinkMutation
} from '@/queries/ngLinkQueries';

type NGLinkContextType = {
  allNGLinksQuery: ReturnType<typeof useNGLinksQuery>;
  createNGLinkMutation: ReturnType<typeof useCreateNGLinkMutation>;
  updateNGLinkMutation: ReturnType<typeof useUpdateNGLinkMutation>;
  deleteNGLinkMutation: ReturnType<typeof useDeleteNGLinkMutation>;
};

const NGLinkContext = createContext<NGLinkContextType | null>(null);

export const useNGLinkContext = () => {
  const context = useContext(NGLinkContext);
  if (!context) {
    throw new Error('useNGLinkContext must be used within a NGLinkProvider');
  }
  return context;
};

export const NGLinkProvider = ({
  children
}: {
  readonly children: ReactNode;
}) => {
  const allNGLinksQuery = useNGLinksQuery();
  const createNGLinkMutation = useCreateNGLinkMutation();
  const updateNGLinkMutation = useUpdateNGLinkMutation();
  const deleteNGLinkMutation = useDeleteNGLinkMutation();

  const value: NGLinkContextType = {
    allNGLinksQuery,
    createNGLinkMutation,
    updateNGLinkMutation,
    deleteNGLinkMutation
  };

  return (
    <NGLinkContext.Provider value={value}>{children}</NGLinkContext.Provider>
  );
};

export default NGLinkContext;
