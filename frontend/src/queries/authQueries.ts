import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { sendFetchRequest } from '@/utils';

export type AuthStatus = {
  authenticated: boolean;
  username?: string;
  email?: string;
  auth_method?: 'simple' | 'okta';
};

export type SimpleLoginPayload = {
  username: string;
};

export type SimpleLoginResponse = {
  redirect?: string;
};

export const useAuthStatusQuery = () => {
  const fetchAuthStatus = async (): Promise<AuthStatus> => {
    const response = await sendFetchRequest('/api/auth/status', 'GET');
    return await response.json();
  };

  return useQuery<AuthStatus, Error>({
    queryKey: ['auth', 'status'],
    queryFn: async () => fetchAuthStatus(),
    retry: false // Don't retry auth failures automatically
  });
};

/**
 * Mutation hook for simple login
 * On success, invalidates auth status to refetch the updated authentication state
 */
export const useSimpleLoginMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<SimpleLoginResponse, Error, SimpleLoginPayload>({
    mutationFn: async (payload: SimpleLoginPayload) => {
      const response = await sendFetchRequest(
        '/api/auth/simple-login',
        'POST',
        payload
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Login failed');
      }

      return await response.json();
    },
    onSuccess: () => {
      // Invalidate auth status to refetch with new authenticated state
      queryClient.invalidateQueries({ queryKey: ['auth', 'status'] });
    }
  });
};
