import { describe, expect, test } from 'vitest';

import { resolveViewerTemplate, withHost } from '@/utils/viewerUrl';
import type { ValidViewer } from '@/contexts/ViewersContext';

const viewer = {
  key: 'neuroglancer',
  displayName: 'Neuroglancer',
  urlTemplate: 'https://ng.internal.example.org/#!',
  manifestTemplateUrl: 'https://neuroglancer-demo.appspot.com/#!',
  logoPath: '',
  label: 'View in Neuroglancer',
  manifest: {} as ValidViewer['manifest']
} satisfies ValidViewer;

describe('resolveViewerTemplate', () => {
  test('defaults to the configured template when no source is set', () => {
    expect(resolveViewerTemplate(viewer, undefined)).toBe(viewer.urlTemplate);
    expect(resolveViewerTemplate(viewer, 'configured')).toBe(
      viewer.urlTemplate
    );
  });

  test('uses the manifest default when source is "manifest"', () => {
    expect(resolveViewerTemplate(viewer, 'manifest')).toBe(
      viewer.manifestTemplateUrl
    );
  });

  test('falls back to the configured template when manifest default is empty', () => {
    const noManifest = { ...viewer, manifestTemplateUrl: '' };
    expect(resolveViewerTemplate(noManifest, 'manifest')).toBe(
      noManifest.urlTemplate
    );
  });

  test('uses the custom URL when provided', () => {
    expect(
      resolveViewerTemplate(viewer, { custom: 'https://custom.example/#!' })
    ).toBe('https://custom.example/#!');
  });

  test('falls back to the configured template for an empty custom URL', () => {
    expect(resolveViewerTemplate(viewer, { custom: '' })).toBe(
      viewer.urlTemplate
    );
  });
});

describe('withHost', () => {
  const template = 'https://wk.janelia.org/import?url={dataLink}';

  test('swaps in a bare host and keeps the path and placeholder', () => {
    expect(withHost(template, ' webknossos.example.org ')).toBe(
      'https://webknossos.example.org/import?url={dataLink}'
    );
  });

  test('accepts an https origin with a port and trailing slash', () => {
    expect(withHost(template, 'https://wk.example.org:8443/')).toBe(
      'https://wk.example.org:8443/import?url={dataLink}'
    );
  });

  test('rejects empty input, http, paths and credentials', () => {
    for (const input of [
      '',
      'http://wk.example.org',
      'wk.example.org/import',
      'wk.example.org?x=1',
      'https://user:pw@wk.example.org',
      'javascript:alert(1)'
    ]) {
      expect(withHost(template, input)).toBeNull();
    }
  });
});
