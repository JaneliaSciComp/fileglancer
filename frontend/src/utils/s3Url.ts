export type ParsedS3Url = {
  bucket: string;
  prefix: string;
  endpointUrl: string;
};

const AWS_HOST = /^(?:(.+)\.)?s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/;

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean).map(decodeURIComponent);
}

export function parseS3Url(input: string): ParsedS3Url | null {
  let url: URL;
  try {
    url = new URL(input.trim());
    if (url.protocol === 's3:') {
      const bucket = decodeURIComponent(url.hostname);
      if (!bucket) {
        return null;
      }
      return {
        bucket,
        prefix: splitPath(url.pathname).join('/'),
        endpointUrl: ''
      };
    }
    if (url.protocol !== 'https:') {
      return null;
    }
    const segments = splitPath(url.pathname);
    const aws = AWS_HOST.exec(url.hostname);
    if (aws?.[1]) {
      return {
        bucket: aws[1],
        prefix: segments.join('/'),
        endpointUrl: ''
      };
    }
    if (segments.length === 0) {
      return null;
    }
    return {
      bucket: segments[0],
      prefix: segments.slice(1).join('/'),
      endpointUrl: aws ? '' : url.origin
    };
  } catch {
    return null;
  }
}
