import React from 'react';
import logger from '@/logger';

type AuthStatus = {
  authenticated: boolean;
  username?: string;
  email?: string;
  auth_method?: 'simple' | 'okta';
};

type AuthContextType = {
  authStatus: AuthStatus | null;
  loading: boolean;
  error: Error | null;
  logout: () => Promise<void>;
  refreshAuthStatus: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextType | null>(null);

export const useAuthContext = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthContextProvider');
  }
  return context;
};

export const AuthContextProvider = ({
  children
}: {
  readonly children: React.ReactNode;
}) => {
  const [authStatus, setAuthStatus] = React.useState<AuthStatus | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<Error | null>(null);

  const fetchAuthStatus = React.useCallback(async () => {
    try {
      const response = await fetch('/api/auth/status', {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch auth status');
      }

      const status: AuthStatus = await response.json();
      setAuthStatus(status);

      // Don't auto-redirect on auth status check
      // Individual routes will handle requiring authentication
    } catch (err) {
      logger.error('Error fetching auth status:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = React.useCallback(async () => {
    try {
      // Navigate directly to logout endpoint - it will handle session cleanup and redirect
      window.location.href = '/api/auth/logout';
    } catch (err) {
      logger.error('Error during logout:', err);
      throw err;
    }
  }, []);

  React.useEffect(() => {
    fetchAuthStatus();
  }, [fetchAuthStatus]);

  return (
    <AuthContext.Provider
      value={{
        authStatus,
        loading,
        error,
        logout,
        refreshAuthStatus: fetchAuthStatus
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
