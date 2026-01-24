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
  unmanaged_id_ed25519_exists: boolean;
  id_ed25519_exists: boolean;
  id_ed25519_missing_pubkey: boolean;
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
 * Result from fetching SSH keys including metadata
 */
export type SSHKeysResult = {
  keys: SSHKeyInfo[];
  unmanaged_id_ed25519_exists: boolean;
  id_ed25519_exists: boolean;
  id_ed25519_missing_pubkey: boolean;
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
    keys: data.keys ?? [],
    unmanaged_id_ed25519_exists: data.unmanaged_id_ed25519_exists ?? false,
    id_ed25519_exists: data.id_ed25519_exists ?? false,
    id_ed25519_missing_pubkey: data.id_ed25519_missing_pubkey ?? false
  };
};

/**
 * Query hook for fetching all SSH keys
 *
 * @returns Query result with SSH keys and metadata
 */
export function useSSHKeysQuery(): UseQueryResult<SSHKeysResult, Error> {
  return useQuery<SSHKeysResult, Error>({
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
 * Backend uses secure bytearray handling that wipes key content from
 * memory after sending. Response is plain text for both key types.
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

  if (!response.ok) {
    const body = await getResponseJsonOrError(response);
    throwResponseNotOkError(response, body);
  }

  const keyText = await response.text();
  return { key: keyText };
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
        comment: response.headers.get('X-SSH-Key-Comment') ?? 'fileglancer',
        has_private_key: false,
        is_authorized: true
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

/**
 * Parameters for regenerating a public key
 */
type RegeneratePublicKeyParams = {
  passphrase?: string;
};

/**
 * Mutation hook for regenerating the public key from the private key.
 *
 * Use this when the .pub file is missing but the private key exists.
 * If the private key is encrypted, provide the passphrase.
 */
export function useRegeneratePublicKeyMutation(): UseMutationResult<
  SSHKeyInfo,
  Error,
  RegeneratePublicKeyParams | void
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params?: RegeneratePublicKeyParams) => {
      const response = await sendFetchRequest(
        '/api/ssh-keys/regenerate-public',
        'POST',
        params?.passphrase ? { passphrase: params.passphrase } : undefined
      );

      const body = await getResponseJsonOrError(response);

      if (!response.ok) {
        throwResponseNotOkError(response, body);
      }

      return body as SSHKeyInfo;
    },
    onSuccess: () => {
      // Invalidate and refetch the list
      queryClient.invalidateQueries({
        queryKey: sshKeyQueryKeys.all
      });
    }
  });
}
