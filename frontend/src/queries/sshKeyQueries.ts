import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';

import { sendFetchRequest } from '@/utils';
import {
  getResponseJsonOrError,
  throwResponseNotOkError
} from '@/queries/queryUtils';

/**
 * Information about an SSH key (without sensitive content)
 */
export type SSHKeyInfo = {
  filename: string;
  key_type: string;
  fingerprint: string;
  comment: string;
  has_private_key: boolean;
  is_authorized: boolean;
};

/**
 * SSH key content - fetched on demand when user clicks copy
 */
export type SSHKeyContent = {
  key: string;
};

/**
 * Response from the list SSH keys endpoint
 */
type SSHKeyListResponse = {
  keys: SSHKeyInfo[];
};

/**
 * Response from the generate SSH key endpoint
 */
type GenerateKeyResponse = {
  key: SSHKeyInfo;
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

  const body = await getResponseJsonOrError(response);

  if (!response.ok) {
    throwResponseNotOkError(response, body);
  }

  const data = body as SSHKeyListResponse;
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
 * Parameters for generating an SSH key
 */
type GenerateKeyParams = {
  passphrase?: string;
};

/**
 * Mutation hook for generating the default SSH key (id_ed25519)
 *
 * Creates an ed25519 key pair and adds it to authorized_keys.
 *
 * @example
 * const mutation = useGenerateSSHKeyMutation();
 * mutation.mutate({ passphrase: 'optional-passphrase' });
 */
export function useGenerateSSHKeyMutation(): UseMutationResult<
  GenerateKeyResponse,
  Error,
  GenerateKeyParams | void
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params?: GenerateKeyParams) => {
      const response = await sendFetchRequest(
        '/api/ssh-keys',
        'POST',
        params?.passphrase ? { passphrase: params.passphrase } : undefined
      );

      const body = await getResponseJsonOrError(response);

      if (!response.ok) {
        throwResponseNotOkError(response, body);
      }

      return body as GenerateKeyResponse;
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
 * Response from the authorize SSH key endpoint
 */
type AuthorizeKeyResponse = {
  message: string;
};

/**
 * Mutation hook for adding the SSH key to authorized_keys
 *
 * @example
 * const mutation = useAuthorizeSSHKeyMutation();
 * mutation.mutate();
 */
export function useAuthorizeSSHKeyMutation(): UseMutationResult<
  AuthorizeKeyResponse,
  Error,
  void
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await sendFetchRequest(
        '/api/ssh-keys/authorize',
        'POST'
      );

      const body = await getResponseJsonOrError(response);

      if (!response.ok) {
        throwResponseNotOkError(response, body);
      }

      return body as AuthorizeKeyResponse;
    },
    onSuccess: () => {
      // Invalidate and refetch the list to update is_authorized status
      queryClient.invalidateQueries({
        queryKey: sshKeyQueryKeys.all
      });
    }
  });
}

/**
 * Fetch SSH key content (public or private key) on demand.
 * This is not a hook - call it imperatively when user clicks copy.
 *
 * @param keyType - Type of key to fetch: 'public' or 'private'
 * @returns Promise with the key content
 */
export async function fetchSSHKeyContent(
  keyType: 'public' | 'private'
): Promise<SSHKeyContent> {
  const response = await sendFetchRequest(
    `/api/ssh-keys/content?key_type=${keyType}`,
    'GET'
  );

  const body = await getResponseJsonOrError(response);

  if (!response.ok) {
    throwResponseNotOkError(response, body);
  }

  return body as SSHKeyContent;
}
