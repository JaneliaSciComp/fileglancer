import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { ZonesAndFileSharePathsMap } from '@/shared.types';
import useZoneAndFileSharePathMapQuery from '@/queries/zoneAndFileSharePathMapQuery';
import { UseQueryResult } from '@tanstack/react-query';

type ZonesAndFspMapContextType = {
  zonesAndFspQuery: UseQueryResult<ZonesAndFileSharePathsMap, Error>;
};

const ZonesAndFspMapContext = createContext<ZonesAndFspMapContextType | null>(
  null
);

export const useZoneAndFspMapContext = () => {
  const context = useContext(ZonesAndFspMapContext);
  if (!context) {
    throw new Error(
      'useZoneAndFspMapContext must be used within a ZoneAndFspMapContextProvider'
    );
  }
  return context;
};

export const ZonesAndFspMapContextProvider = ({
  children
}: {
  readonly children: ReactNode;
}) => {
  const zonesAndFspQuery = useZoneAndFileSharePathMapQuery();
  return (
    <ZonesAndFspMapContext.Provider
      value={{
        zonesAndFspQuery
      }}
    >
      {children}
    </ZonesAndFspMapContext.Provider>
  );
};
