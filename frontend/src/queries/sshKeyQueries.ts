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
};

/**
 * Response from the list SSH keys endpoint
 */
type SSHKeyListResponse = {
  keys: SSHKeyInfo[];
};

// Query key factory for SSH keys
export const sshKeyQueryKeys = {
  all: ['sshKeys'] as const,
  list: () => ['sshKeys', 'list'] as const
};

/**
 * Result from fetching SSH keys
 */
export type SSHKeysResult = {
  keys: SSHKeyInfo[];
};

/**
 * Fetches all SSH keys from the backend
 */
const fetchSSHKeys = async (signal?: AbortSignal): Promise<SSHKeysResult> => {
  const response = await sendFetchRequest('/api/ssh-keys', 'GET', undefined, {
    signal
  });

  const body = await getResponseJsonOrError(response);

  if (!response.ok) {
    throwResponseNotOkError(response, body);
  }

  const data = body as SSHKeyListResponse;
  return {
    keys: data.keys ?? []
  };
};

/**
 * Query hook for fetching all SSH keys
 *
 * @returns Query result with SSH keys
 */
export function useSSHKeysQuery(): UseQueryResult<SSHKeysResult, Error> {
  return useQuery<SSHKeysResult, Error>({
    queryKey: sshKeyQueryKeys.list(),
    queryFn: ({ signal }) => fetchSSHKeys(signal)
  });
}

/**
 * Result from generating a temporary SSH key
 */
export type TempKeyResult = {
  privateKey: string;
  keyInfo: SSHKeyInfo;
};

/**
 * Parameters for generating a temporary SSH key
 */
type GenerateTempKeyParams = {
  passphrase?: string;
};

/**
 * Mutation hook for generating a temporary SSH key.
 *
 * Generates a key, adds public key to authorized_keys, and returns
 * the private key for one-time display. The temporary files are
 * deleted on the server after the response is sent.
 */
export function useGenerateTempKeyMutation(): UseMutationResult<
  TempKeyResult,
  Error,
  GenerateTempKeyParams | void
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params?: GenerateTempKeyParams) => {
      const response = await sendFetchRequest(
        '/api/ssh-keys/generate-temp',
        'POST',
        params?.passphrase ? { passphrase: params.passphrase } : undefined
      );

      if (!response.ok) {
        const body = await getResponseJsonOrError(response);
        throwResponseNotOkError(response, body);
      }

      // Private key is in response body
      const privateKey = await response.text();

      // Key info is in response headers
      const keyInfo: SSHKeyInfo = {
        filename: response.headers.get('X-SSH-Key-Filename') ?? 'temporary',
        key_type: response.headers.get('X-SSH-Key-Type') ?? 'ssh-ed25519',
        fingerprint: response.headers.get('X-SSH-Key-Fingerprint') ?? '',
        comment: response.headers.get('X-SSH-Key-Comment') ?? 'fileglancer'
      };

      return { privateKey, keyInfo };
    },
    onSuccess: () => {
      // Invalidate and refetch the list to show the new key
      queryClient.invalidateQueries({
        queryKey: sshKeyQueryKeys.all
      });
    }
  });
}
