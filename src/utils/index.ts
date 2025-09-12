import {
  escapePathForUrl,
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
  return date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatDateString = (dateStr: string) => {
  // If dateStr does not end with 'Z' or contain a timezone offset, treat as UTC
  let normalized = dateStr;
  if (!/Z$|[+-]\d{2}:\d{2}$/.test(dateStr)) {
    normalized = dateStr + 'Z';
  }
  const date = new Date(normalized);
  return date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    month: 'numeric',
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

async function checkSessionValidity(xrsfCookie: string): Promise<boolean> {
  try {
    const response = await fetch(getFullPath('/api/fileglancer/profile'), {
      method: 'GET',
      credentials: 'include',
      headers: {
        'X-Xsrftoken': xrsfCookie
      }
    });
    return response.ok;
  } catch (error) {
    return false;
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

  // Check for 403 Forbidden - could be permission denied or session expired
  if (response.status === 403) {
    // Check if session is still valid by testing a stable endpoint
    const sessionValid = await checkSessionValidity(xrsfCookie);
    if (!sessionValid) {
      // Session has expired, redirect to logout
      window.location.href = `${window.location.origin}/logout`;
      throw new HTTPError('Session expired', 401);
    }
    // If session is valid, this is just a permission denied for this specific resource
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

/**
 * Used to access objects in the ZonesAndFileSharePathsMap or in the zone, fsp, or folder preference maps
 * @param type zone, fsp, or folder
 * @param name for zones or FSPs, use zone.name or fsp.name. For folders, the name is defined as `${fsp.name}_${folder.path}`
 * @returns a map key string
 */
function makeMapKey(type: 'zone' | 'fsp' | 'folder', name: string): string {
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

function isLikelyTextFile(buffer: ArrayBuffer | Uint8Array): boolean {
  const view = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;

  let controlCount = 0;
  for (const b of view) {
    if (b < 9 || (b > 13 && b < 32)) {
      controlCount++;
    }
  }

  return controlCount / view.length < 0.01;
}

async function fetchFileWithTextDetection(
  fspName: string,
  path: string,
  cookies: Record<string, string>
): Promise<{ isText: boolean; content: string; rawData: Uint8Array }> {
  const rawData = await fetchFileContent(fspName, path, cookies);
  const isText = isLikelyTextFile(rawData);

  let content: string;
  if (isText) {
    content = new TextDecoder('utf-8', { fatal: false }).decode(rawData);
  } else {
    content = 'Binary file';
  }

  return { isText, content, rawData };
}

export {
  checkSessionValidity,
  escapePathForUrl,
  fetchFileAsJson,
  fetchFileAsText,
  fetchFileContent,
  fetchFileWithTextDetection,
  getFullPath,
  formatDateString,
  formatUnixTimestamp,
  formatFileSize,
  getFileContentPath,
  getFileBrowsePath,
  getFileURL,
  getLastSegmentFromPath,
  getPreferredPathForDisplay,
  HTTPError,
  isLikelyTextFile,
  joinPaths,
  makeBrowseLink,
  makeMapKey,
  makePathSegmentArray,
  parsePermissions,
  removeLastSegmentFromPath,
  sendFetchRequest
};
