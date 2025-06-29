import {
  getFileContentPath,
  getFileBrowsePath,
  getFileURL,
  getFullPath,
  getLastSegmentFromPath,
  getPreferredPathForDisplay,
  joinPaths,
  makeBrowseLink,
  makePathSegmentArray,
  removeLastSegmentFromPath
} from './pathHandling';

const formatFileSize = (sizeInBytes: number): string => {
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} bytes`;
  } else if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(0)} KB`;
  } else if (sizeInBytes < 1024 * 1024 * 1024) {
    return `${(sizeInBytes / (1024 * 1024)).toFixed(0)} MB`;
  } else {
    return `${(sizeInBytes / (1024 * 1024 * 1024)).toFixed(0)} GB`;
  }
};

const formatUnixTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

class HTTPError extends Error {
  responseCode: number;

  constructor(message: string, responseCode: number) {
    super(message);
    this.responseCode = responseCode;
  }
}

async function sendFetchRequest(
  apiPath: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  xrsfCookie: string,
  body?: { [key: string]: any }
): Promise<Response> {
  const options: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      'X-Xsrftoken': xrsfCookie,
      ...(method !== 'GET' &&
        method !== 'DELETE' && { 'Content-Type': 'application/json' })
    },
    ...(method !== 'GET' &&
      method !== 'DELETE' &&
      body && { body: JSON.stringify(body) })
  };
  const response = await fetch(getFullPath(apiPath), options);
  if (!response.ok) {
    throw new HTTPError(
      `Request failed: ${response.status} - ${response.statusText}`,
      response.status
    );
  }
  return response;
}

// Parse the Unix-style permissions string (e.g., "drwxr-xr-x")
const parsePermissions = (permissionString: string) => {
  // Owner permissions (positions 1-3)
  const ownerRead = permissionString[1] === 'r';
  const ownerWrite = permissionString[2] === 'w';

  // Group permissions (positions 4-6)
  const groupRead = permissionString[4] === 'r';
  const groupWrite = permissionString[5] === 'w';

  // Others/everyone permissions (positions 7-9)
  const othersRead = permissionString[7] === 'r';
  const othersWrite = permissionString[8] === 'w';

  return {
    owner: { read: ownerRead, write: ownerWrite },
    group: { read: groupRead, write: groupWrite },
    others: { read: othersRead, write: othersWrite }
  };
};

function makeMapKey(type: string, name: string): string {
  return `${type}_${name}`;
}

async function fetchFileContent(
  fspName: string,
  path: string,
  cookies: Record<string, string>
): Promise<Uint8Array> {
  const url = getFileContentPath(fspName, path);
  const response = await sendFetchRequest(url, 'GET', cookies._xsrf);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }
  const fileBuffer = await response.arrayBuffer();
  return new Uint8Array(fileBuffer);
}

async function fetchFileAsText(
  fspName: string,
  path: string,
  cookies: Record<string, string>
): Promise<string> {
  const fileContent = await fetchFileContent(fspName, path, cookies);
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(fileContent);
}

async function fetchFileAsJson(
  fspName: string,
  path: string,
  cookies: Record<string, string>
): Promise<object> {
  const fileText = await fetchFileAsText(fspName, path, cookies);
  return JSON.parse(fileText);
}

export {
  fetchFileAsJson,
  fetchFileAsText,
  fetchFileContent,
  getFullPath,
  formatUnixTimestamp,
  formatFileSize,
  getFileBrowsePath,
  getFileURL,
  getLastSegmentFromPath,
  getPreferredPathForDisplay,
  HTTPError,
  joinPaths,
  makeBrowseLink,
  makeMapKey,
  makePathSegmentArray,
  parsePermissions,
  removeLastSegmentFromPath,
  sendFetchRequest
};
