import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import logger from '@/logger';

import type { Profile } from '@/shared.types';
import { useProfileQuery } from '@/queries/profileQuery';

type ProfileContextType = {
  profile: Profile | undefined;
  loading: boolean;
  error: Error | null;
};

const ProfileContext = createContext<ProfileContextType | null>(null);

export const useProfileContext = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error(
      'useProfileContext must be used within a ProfileContextProvider'
    );
  }
  return context;
};

export const ProfileContextProvider = ({
  children
}: {
  readonly children: ReactNode;
}) => {
  const { data: profile, isPending, isError, error } = useProfileQuery();
  if (isError) {
    logger.error('Error fetching profile:', error);
  }
  return (
    <ProfileContext.Provider value={{ profile, loading: isPending, error }}>
      {children}
    </ProfileContext.Provider>
  );
};
