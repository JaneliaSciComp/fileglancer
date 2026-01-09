import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryFunctionContext
} from '@tanstack/react-query';

import { sendRequestAndThrowForNotOk } from './queryUtils';

export type AuthStatus = {
  authenticated: boolean;
  username?: string;
  email?: string;
  auth_method?: 'simple' | 'okta';
};

export type SimpleLoginPayload = {
  username: string;
  next?: string;
};

export type SimpleLoginResponse = {
  redirect?: string;
};

export const useAuthStatusQuery = () => {
  const fetchAuthStatus = async ({
    signal
  }: QueryFunctionContext): Promise<AuthStatus> => {
    return (await sendRequestAndThrowForNotOk(
      '/api/auth/status',
      'GET',
      undefined,
      { signal }
    )) as AuthStatus;
  };

  return useQuery<AuthStatus, Error>({
    queryKey: ['auth', 'status'],
    queryFn: fetchAuthStatus,
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
      const data = await sendRequestAndThrowForNotOk(
        '/api/auth/simple-login',
        'POST',
        payload
      );

      return data as SimpleLoginResponse;
    },
    onSuccess: () => {
      // Invalidate auth status to refetch with new authenticated state
      queryClient.invalidateQueries({ queryKey: ['auth', 'status'] });
    }
  });
};
