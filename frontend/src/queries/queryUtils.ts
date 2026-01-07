import { buildUrl, sendFetchRequest } from '@/utils';
import type { FetchRequestOptions } from '@/shared.types';

export async function getResponseJsonOrError(response: Response) {
  const body = await response.json().catch(() => {
    if (!response.ok) {
      throw new Error(
        `Server returned ${response.status} ${response.statusText}`
      );
    }
    // If response was OK but not JSON (unlikely for this API but good safety)
    throw new Error('Invalid response from server');
  });
  return body;
}

export function throwResponseNotOkError(response: Response, body: any): never {
  throw new Error(
    `${response.status} ${response.statusText}:\n` +
      (body.error ? `${body.error}` : ' Unknown error occurred')
  );
}

export async function sendRequestAndThrowForNotOk(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  bodyObj?: any
): Promise<void> {
  const response = await sendFetchRequest(
    url,
    method,
    bodyObj ? bodyObj : undefined
  );

  if (!response.ok) {
    const body = await getResponseJsonOrError(response);
    throwResponseNotOkError(response, body);
  }
}

export async function fetchFileContent(
  fspName: string,
  path: string,
  options?: FetchRequestOptions
): Promise<Uint8Array> {
  const url = buildUrl('/api/content/', fspName, { subpath: path });
  const response = await sendFetchRequest(url, 'GET', undefined, options);

  if (!response.ok) {
    throwResponseNotOkError(response, await getResponseJsonOrError(response));
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
