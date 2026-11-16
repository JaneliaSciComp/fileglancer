import type { ValidViewer } from '@/contexts/ViewersContext';
import type { ViewerUrlSource } from '@/contexts/PreferencesContext';

/**
 * Resolve the URL template to use for a viewer given the user's chosen source.
 *
 * Falls back to the deployment-configured template for an absent/unknown source
 * or when the requested template is empty, so callers always get a usable value.
 */
export function resolveViewerTemplate(
  viewer: ValidViewer,
  source: ViewerUrlSource | undefined
): string {
  if (!source || source === 'configured') {
    return viewer.urlTemplate;
  }
  if (source === 'manifest') {
    return viewer.manifestTemplateUrl || viewer.urlTemplate;
  }
  if (typeof source === 'object' && source.custom) {
    return source.custom;
  }
  return viewer.urlTemplate;
}

/**
 * Point a viewer's URL template at a different host, keeping its path and
 * query. Accepts a bare host (`wk.example.org`) or an https origin
 * (`https://wk.example.org`, with an optional port and trailing slash).
 * Returns null when the input is anything else, such as a path or http.
 */
export function withHost(template: string, input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  let target: URL;
  try {
    target = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (
    target.protocol !== 'https:' ||
    target.pathname !== '/' ||
    target.search ||
    target.hash ||
    target.username ||
    target.password
  ) {
    return null;
  }
  const { origin } = new URL(template);
  return target.origin + template.slice(origin.length);
}
