import { default as log } from '@/logger';
import { useEffect, useState } from 'react';

type Profile = {
  username: string;
};

function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch('/api/fileglancer/profile');
        if (!response.ok) {
          throw new Error('Failed to fetch profile data');
        }
        const profileData: Profile = await response.json();
        setProfile(profileData);
      } catch (err) {
        log.error('Error fetching profile:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  return { profile, loading, error };
}

export default useProfile;
