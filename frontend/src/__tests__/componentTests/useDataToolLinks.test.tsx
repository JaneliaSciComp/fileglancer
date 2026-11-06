import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';

import useDataToolLinks from '@/hooks/useDataToolLinks';
import type { OpenWithToolUrls, PendingToolKey } from '@/hooks/useZarrMetadata';

const mutateAsync = vi.fn();
const refetch = vi.fn();
let currentDirLink: { url: string } | null | undefined;

vi.mock('@/contexts/FileBrowserContext', () => ({
  useFileBrowserContext: () => ({
    fileQuery: {
      data: {
        currentFileSharePath: { name: 'fsp', linux_path: '/groups/x' },
        currentFileOrFolder: { path: 'data/img.zarr' }
      }
    },
    fileBrowserState: { dataLinkPath: 'data/img.zarr' }
  })
}));
vi.mock('@/contexts/ProxiedPathContext', () => ({
  useProxiedPathContext: () => ({
    createProxiedPathMutation: { mutateAsync },
    deleteProxiedPathMutation: { mutateAsync: vi.fn() },
    allProxiedPathsQuery: { refetch },
    currentDirProxiedPathQuery: { data: currentDirLink }
  })
}));
vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({
    areDataLinksAutomatic: true,
    dataLinkSubpathMode: 'name'
  })
}));
vi.mock('@/contexts/ExternalBucketContext', () => ({
  useExternalBucketContext: () => ({ externalDataUrlQuery: { data: null } })
}));
vi.mock('@/hooks/useCopyTooltip', () => ({
  default: () => ({ handleCopy: vi.fn(), showCopiedTooltip: false })
}));

type Api = ReturnType<typeof useDataToolLinks>;

function Harness({
  apiRef,
  urls,
  pending = null
}: {
  apiRef: { current: Api | null };
  urls: OpenWithToolUrls | null;
  pending?: PendingToolKey;
}) {
  apiRef.current = useDataToolLinks(vi.fn(), urls, pending, vi.fn());
  return null;
}

const NG_URL = 'https://ng.example/#!state';
const URLS: OpenWithToolUrls = {
  copy: 'https://links.example/key/img.zarr',
  neuroglancer: NG_URL
};

let tab: {
  location: { href: string };
  closed: boolean;
  close: ReturnType<typeof vi.fn>;
};
let resolveCreate: (value: unknown) => void;
let rejectCreate: (reason: unknown) => void;

beforeEach(() => {
  currentDirLink = undefined;
  tab = { location: { href: '' }, closed: false, close: vi.fn() };
  vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  refetch.mockReset().mockResolvedValue(undefined);
  mutateAsync.mockReset().mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        resolveCreate = resolve;
        rejectCreate = reject;
      })
  );
});

describe('useDataToolLinks viewer click without a data link', () => {
  it('opens the tab during the click, then points it at the viewer URL once the link exists', async () => {
    const apiRef: { current: Api | null } = { current: null };
    const { rerender } = render(
      <Harness apiRef={apiRef} urls={{ copy: '', neuroglancer: '' }} />
    );

    let done: Promise<void>;
    act(() => {
      done = apiRef.current!.handleToolClick('neuroglancer');
    });
    // Before the data link POST resolves: the popup must already be open,
    // otherwise the browser's user activation can expire and block it.
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(mutateAsync).toHaveBeenCalledOnce();

    await act(async () => {
      resolveCreate({});
    });
    currentDirLink = { url: URLS.copy };
    rerender(<Harness apiRef={apiRef} urls={URLS} />);

    await act(async () => {
      await done;
    });
    await waitFor(() => expect(tab.location.href).toBe(NG_URL));
    expect(tab.close).not.toHaveBeenCalled();
  });

  it('closes the pre-opened tab when the data link creation fails', async () => {
    const apiRef: { current: Api | null } = { current: null };
    render(<Harness apiRef={apiRef} urls={{ copy: '', neuroglancer: '' }} />);

    let done: Promise<void>;
    act(() => {
      done = apiRef.current!.handleToolClick('neuroglancer');
    });
    await act(async () => {
      rejectCreate(new Error('boom'));
      await done;
    });
    expect(tab.close).toHaveBeenCalledOnce();
  });

  it('falls back to an anchor click when the user closed the pre-opened tab', async () => {
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const apiRef: { current: Api | null } = { current: null };
    const { rerender } = render(
      <Harness apiRef={apiRef} urls={{ copy: '', neuroglancer: '' }} />
    );

    let done: Promise<void>;
    act(() => {
      done = apiRef.current!.handleToolClick('neuroglancer');
    });
    tab.closed = true;
    await act(async () => {
      resolveCreate({});
    });
    currentDirLink = { url: URLS.copy };
    rerender(<Harness apiRef={apiRef} urls={URLS} />);
    await act(async () => {
      await done;
    });
    expect(tab.location.href).toBe('');
    expect(anchorClick).toHaveBeenCalledOnce();
    anchorClick.mockRestore();
  });

  it('ignores a second click while the first is still creating the link', async () => {
    const apiRef: { current: Api | null } = { current: null };
    render(<Harness apiRef={apiRef} urls={{ copy: '', neuroglancer: '' }} />);

    let first: Promise<void>;
    let second: Promise<void>;
    act(() => {
      first = apiRef.current!.handleToolClick('neuroglancer');
      second = apiRef.current!.handleToolClick('neuroglancer');
    });
    expect(window.open).toHaveBeenCalledOnce();
    expect(mutateAsync).toHaveBeenCalledOnce();
    await act(async () => {
      rejectCreate(new Error('boom'));
      await Promise.all([first, second]);
    });
  });

  it('does not open a tab when the link name fails validation', async () => {
    const apiRef: { current: Api | null } = { current: null };
    render(
      <Harness
        apiRef={apiRef}
        pending="neuroglancer"
        urls={{ copy: '', neuroglancer: '' }}
      />
    );

    await act(async () => {
      await apiRef.current!.handleDialogConfirm('bad//name');
    });
    expect(window.open).not.toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
