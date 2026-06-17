import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseAppLaunchParamsFile } from '@/shared.types';
import { downloadTextFile } from '@/utils';

describe('parseAppLaunchParamsFile', () => {
  it('parses a full params object', () => {
    const text = JSON.stringify({
      parameters: { input: '/data/foo' },
      resources: { cpus: 4, memory: '16 GB' },
      extra_args: '-W 1:00',
      env: { FOO: 'bar' },
      pre_run: 'echo hi',
      post_run: 'echo bye',
      container: 'docker://img',
      container_args: '--nv'
    });
    const parsed = parseAppLaunchParamsFile(text);
    expect(parsed.parameters).toEqual({ input: '/data/foo' });
    expect(parsed.resources).toEqual({ cpus: 4, memory: '16 GB' });
    expect(parsed.env).toEqual({ FOO: 'bar' });
    expect(parsed.container).toBe('docker://img');
  });

  it('parses a partial object targeting a single tab', () => {
    const parsed = parseAppLaunchParamsFile(
      JSON.stringify({ resources: { queue: 'gpu' } })
    );
    expect(parsed.resources).toEqual({ queue: 'gpu' });
    expect(parsed.parameters).toBeUndefined();
    expect(parsed.env).toBeUndefined();
  });

  it('throws on invalid JSON', () => {
    expect(() => parseAppLaunchParamsFile('{ not json')).toThrow(
      /not valid JSON/i
    );
  });

  it('throws on a JSON array', () => {
    expect(() => parseAppLaunchParamsFile('[1, 2, 3]')).toThrow(
      /JSON object/i
    );
  });

  it('throws on a JSON primitive', () => {
    expect(() => parseAppLaunchParamsFile('42')).toThrow(/JSON object/i);
    expect(() => parseAppLaunchParamsFile('null')).toThrow(/JSON object/i);
  });
});

describe('downloadTextFile', () => {
  const clickSpy = vi.fn();
  const anchor = {
    href: '',
    download: '',
    click: clickSpy
  } as unknown as HTMLAnchorElement;

  beforeEach(() => {
    anchor.href = '';
    anchor.download = '';
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('creates an anchor with the given filename and clicks it', () => {
    downloadTextFile('{"a":1}', 'my-params.json');

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(anchor.href).toBe('blob:mock');
    expect(anchor.download).toBe('my-params.json');
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('defaults to the application/json mime type', () => {
    const blobSpy = vi.spyOn(globalThis, 'Blob');
    downloadTextFile('hello', 'f.json');
    expect(blobSpy).toHaveBeenCalledWith(['hello'], {
      type: 'application/json'
    });
  });
});
