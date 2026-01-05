import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import {
  useNeuroglancerShortLinksQuery,
  useCreateNeuroglancerShortLinkMutation,
  useUpdateNeuroglancerShortLinkMutation
} from '@/queries/neuroglancerQueries';

type NeuroglancerContextType = {
  allNeuroglancerLinksQuery: ReturnType<typeof useNeuroglancerShortLinksQuery>;
  createNeuroglancerShortLinkMutation: ReturnType<
    typeof useCreateNeuroglancerShortLinkMutation
  >;
  updateNeuroglancerShortLinkMutation: ReturnType<
    typeof useUpdateNeuroglancerShortLinkMutation
  >;
};

const NeuroglancerContext = createContext<NeuroglancerContextType | null>(null);

export const useNeuroglancerContext = () => {
  const context = useContext(NeuroglancerContext);
  if (!context) {
    throw new Error(
      'useNeuroglancerContext must be used within a NeuroglancerProvider'
    );
  }
  return context;
};

export const NeuroglancerProvider = ({
  children
}: {
  readonly children: ReactNode;
}) => {
  const allNeuroglancerLinksQuery = useNeuroglancerShortLinksQuery();
  const createNeuroglancerShortLinkMutation =
    useCreateNeuroglancerShortLinkMutation();
  const updateNeuroglancerShortLinkMutation =
    useUpdateNeuroglancerShortLinkMutation();

  const value: NeuroglancerContextType = {
    allNeuroglancerLinksQuery,
    createNeuroglancerShortLinkMutation,
    updateNeuroglancerShortLinkMutation
  };

  return (
    <NeuroglancerContext.Provider value={value}>
      {children}
    </NeuroglancerContext.Provider>
  );
};

export default NeuroglancerContext;
