import React from 'react';
import logger from '@/logger';

import { sendFetchRequest } from '@/utils';
import { useCookiesContext } from '@/contexts/CookiesContext';

type Profile = {
  username: string;
  homeFileSharePathName: string;
  homeDirectoryName: string;
  groups: string[];
};

type ProfileContextType = {
  profile: Profile | null;
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
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<Error | null>(null);
  const { cookies } = useCookiesContext();

  React.useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await sendFetchRequest(
          '/api/profile',
          'GET',
          cookies['_xsrf']
        );
        if (!response.ok) {
          throw new Error('Failed to fetch profile data');
        }
        const profileData: Profile = await response.json();
        setProfile(profileData);
      } catch (err) {
        logger.error('Error fetching profile:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [cookies]);

  return (
    <ProfileContext.Provider value={{ profile, loading, error }}>
      {children}
    </ProfileContext.Provider>
  );
};
