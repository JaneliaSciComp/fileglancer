import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  UseMutationResult
} from '@tanstack/react-query';

import { sendFetchRequest } from '@/utils';
import { toHttpError } from '@/utils/errorHandling';

/**
 * Information about an SSH key
 */
export type SSHKeyInfo = {
  filename: string;
  key_type: string;
  fingerprint: string;
  comment: string;
  public_key: string;
  private_key: string | null;
  has_private_key: boolean;
  is_authorized: boolean;
};

/**
 * Response from the list SSH keys endpoint
 */
type SSHKeyListResponse = {
  keys: SSHKeyInfo[];
};

/**
 * Payload for generating a new SSH key
 */
type GenerateKeyPayload = {
  key_name: string;
  comment?: string;
  add_to_authorized_keys: boolean;
};

/**
 * Response from the generate SSH key endpoint
 */
type GenerateKeyResponse = {
  key: SSHKeyInfo;
  message: string;
};

/**
 * Payload for authorizing a key
 */
type AuthorizeKeyPayload = {
  key_name: string;
};

/**
 * Response from the authorize key endpoint
 */
type AuthorizeKeyResponse = {
  message: string;
};

/**
 * Payload for deleting a key
 */
type DeleteKeyPayload = {
  key_name: string;
};

/**
 * Response from the delete key endpoint
 */
type DeleteKeyResponse = {
  message: string;
};

// Query key factory for SSH keys
export const sshKeyQueryKeys = {
  all: ['sshKeys'] as const,
  list: () => ['sshKeys', 'list'] as const
};

/**
 * Fetches all SSH keys from the backend
 */
const fetchSSHKeys = async (signal?: AbortSignal): Promise<SSHKeyInfo[]> => {
  const response = await sendFetchRequest('/api/ssh-keys', 'GET', undefined, {
    signal
  });

  if (!response.ok) {
    throw await toHttpError(response);
  }

  const data = (await response.json()) as SSHKeyListResponse;
  return data.keys ?? [];
};

/**
 * Query hook for fetching all SSH keys
 *
 * @returns Query result with all SSH keys
 */
export function useSSHKeysQuery(): UseQueryResult<SSHKeyInfo[], Error> {
  return useQuery<SSHKeyInfo[], Error>({
    queryKey: sshKeyQueryKeys.list(),
    queryFn: ({ signal }) => fetchSSHKeys(signal)
  });
}

/**
 * Mutation hook for generating a new SSH key
 *
 * @example
 * const mutation = useGenerateSSHKeyMutation();
 * mutation.mutate({ key_name: 'my_key', add_to_authorized_keys: true });
 */
export function useGenerateSSHKeyMutation(): UseMutationResult<
  GenerateKeyResponse,
  Error,
  GenerateKeyPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: GenerateKeyPayload) => {
      const response = await sendFetchRequest('/api/ssh-keys', 'POST', payload);

      if (!response.ok) {
        throw await toHttpError(response);
      }

      return (await response.json()) as GenerateKeyResponse;
    },
    onSuccess: () => {
      // Invalidate and refetch the list
      queryClient.invalidateQueries({
        queryKey: sshKeyQueryKeys.all
      });
    }
  });
}

/**
 * Mutation hook for authorizing an SSH key (adding to authorized_keys)
 *
 * @example
 * const mutation = useAuthorizeSSHKeyMutation();
 * mutation.mutate({ key_name: 'id_ed25519' });
 */
export function useAuthorizeSSHKeyMutation(): UseMutationResult<
  AuthorizeKeyResponse,
  Error,
  AuthorizeKeyPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: AuthorizeKeyPayload) => {
      const response = await sendFetchRequest(
        `/api/ssh-keys/${encodeURIComponent(payload.key_name)}/authorize`,
        'POST'
      );

      if (!response.ok) {
        throw await toHttpError(response);
      }

      return (await response.json()) as AuthorizeKeyResponse;
    },
    onSuccess: () => {
      // Invalidate and refetch the list to update is_authorized flags
      queryClient.invalidateQueries({
        queryKey: sshKeyQueryKeys.all
      });
    }
  });
}

/**
 * Mutation hook for deleting an SSH key
 *
 * @example
 * const mutation = useDeleteSSHKeyMutation();
 * mutation.mutate({ key_name: 'id_ed25519' });
 */
export function useDeleteSSHKeyMutation(): UseMutationResult<
  DeleteKeyResponse,
  Error,
  DeleteKeyPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: DeleteKeyPayload) => {
      const response = await sendFetchRequest(
        `/api/ssh-keys/${encodeURIComponent(payload.key_name)}`,
        'DELETE'
      );

      if (!response.ok) {
        throw await toHttpError(response);
      }

      return (await response.json()) as DeleteKeyResponse;
    },
    onSuccess: () => {
      // Invalidate and refetch the list
      queryClient.invalidateQueries({
        queryKey: sshKeyQueryKeys.all
      });
    }
  });
}
