import React from 'react';
import logger from '@/logger';

import type { Profile } from '@/shared.types';
import { useProfileQuery } from '@/queries/useProfileQuery';

type ProfileContextType = {
  profile: Profile | undefined;
  loading: boolean;
  error: Error | null;
};

const ProfileContext = React.createContext<ProfileContextType | null>(null);

export const useProfileContext = () => {
  const context = React.useContext(ProfileContext);
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
  readonly children: React.ReactNode;
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
