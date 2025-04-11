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

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

function getAPIPathRoot() {
  const match = window.location.pathname.match(/^\/jupyter\/user\/[^/]+\//);
  if (match) {
    return match[0];
  }
  return '/';
}

async function sendGetRequest(
  url: string,
  xrsfCookie: string
): Promise<Response> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'X-Xsrftoken': xrsfCookie
    }
  });
  if (!response.ok) {
    throw new Error(`Response status: ${response.status}`);
  }
  return response;
}

async function sendPutRequest(
  url: string,
  xrsfCookie: string,
  body: any
): Promise<Response> {
  const response = await fetch(url, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'X-Xsrftoken': xrsfCookie,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Response status: ${response.status}`);
  }
  return response;
}

export {
  formatFileSize,
  formatDate,
  getAPIPathRoot,
  sendGetRequest,
  sendPutRequest
};
