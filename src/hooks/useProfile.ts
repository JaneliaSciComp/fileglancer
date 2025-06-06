import { useEffect, useState } from 'react';
import { sendFetchRequest } from '@/utils';
import { useCookiesContext } from '@/contexts/CookiesContext';

type Profile = {
  username: string;
};

function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const { cookies } = useCookiesContext();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await sendFetchRequest('/api/fileglancer/profile', 'GET', cookies['_xsrf']);
        if (!response.ok) {
          throw new Error('Failed to fetch profile data');
        }
        const profileData: Profile = await response.json();
        setProfile(profileData);
      } catch (err) {
        console.error('Error fetching profile:', err);
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
