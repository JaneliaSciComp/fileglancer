import { createContext, useContext, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import logger from '@/logger';
import { useAuthStatusQuery, type AuthStatus } from '@/queries/authQueries';

type AuthContextType = {
  authStatus: AuthStatus | null;
  loading: boolean;
  error: Error | null;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(
      'useAuthContext must be used within an AuthContextProvider'
    );
  }
  return context;
};

export const AuthContextProvider = ({
  children
}: {
  readonly children: ReactNode;
}) => {
  const queryClient = useQueryClient();
  const { data: authStatus, isLoading: loading, error } = useAuthStatusQuery();

  const logout = useCallback(async () => {
    try {
      // Invalidate auth query cache before navigating to logout
      await queryClient.invalidateQueries({ queryKey: ['auth', 'status'] });

      // Navigate directly to logout endpoint - it will handle session cleanup and redirect
      window.location.href = '/api/auth/logout';
    } catch (err) {
      logger.error('Error during logout:', err);
      throw err;
    }
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{
        authStatus: authStatus ?? null,
        loading,
        error: error ?? null,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
