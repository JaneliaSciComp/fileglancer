import { buildUrl, sendFetchRequest } from '@/utils';
import type { RequestBody } from '@/utils';
import type { FetchRequestOptions } from '@/shared.types';

export async function getResponseJsonOrError(response: Response) {
  const body = await response.json().catch(() => {
    // This is to handle any 200 responses without JSON body
    if (response.ok) {
      return { message: 'Response has no JSON body or invalid JSON' };
    }
    if (!response.ok) {
      throw new Error(
        `Server returned ${response.status} ${response.statusText}`
      );
    }
  });
  return body;
}

export function throwResponseNotOkError(response: Response, body: any): never {
  throw new Error(
    `${response.status} ${response.statusText}:\n` +
      (body.error ? `${body.error}` : ' Unknown error occurred')
  );
}

// Note: do not use if you want special error handling for certain status codes
// In that case, use sendFetchRequest + getResponseJsonOrError +
// special handling then throwResponseNotOkError
export async function sendRequestAndThrowForNotOk(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  bodyObj?: RequestBody,
  options?: FetchRequestOptions
): Promise<unknown> {
  const response = await sendFetchRequest(
    url,
    method,
    bodyObj ? bodyObj : undefined,
    options
  );

  const body = await getResponseJsonOrError(response);

  if (!response.ok) {
    throwResponseNotOkError(response, body);
  }
  return body;
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
