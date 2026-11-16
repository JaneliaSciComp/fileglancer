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
    // A host with an underscore cannot be an S3 endpoint (botocore rejects it), so
    // it must be a bucket served as a subdomain, e.g. my_bucket.store.example.org
    const [first, ...rest] = url.hostname.split('.');
    if (first.includes('_') && rest.length > 0) {
      const endpoint = new URL(url);
      endpoint.hostname = rest.join('.');
      return {
        bucket: first,
        prefix: segments.join('/'),
        endpointUrl: endpoint.origin
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
