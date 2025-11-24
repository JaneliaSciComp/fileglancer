import { buildUrl, sendFetchRequest } from '@/utils';
import type { FetchRequestOptions } from '@/shared.types';

export async function fetchFileContent(
  fspName: string,
  path: string,
  options?: FetchRequestOptions
): Promise<Uint8Array> {
  const url = buildUrl('/api/content/', fspName, { subpath: path });
  const response = await sendFetchRequest(url, 'GET', undefined, options);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.error ? body.error : `Failed to fetch file (${response.status})`
    );
  }

  const fileBuffer = await response.arrayBuffer();
  return new Uint8Array(fileBuffer);
}

export async function fetchFileAsText(
  fspName: string,
  path: string
): Promise<string> {
  const fileContent = await fetchFileContent(fspName, path);
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(fileContent);
}

export async function fetchFileAsJson(
  fspName: string,
  path: string
): Promise<object> {
  const fileText = await fetchFileAsText(fspName, path);
  return JSON.parse(fileText);
}
