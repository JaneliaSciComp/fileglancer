# Neuroglancer Views — PR 5a (`ngviews-05a-cart-pipeline`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the file-browser → **Layer Cart** → **saved View** pipeline: select datasets in the browser, add them to a server-persisted cart (or make a View straight from a multi-row selection), and check the cart out into a saved Neuroglancer View — creating the backing Data Links (consent-gated) and a generated `ng_state` along the way.

**Architecture:** PR 4 already shipped `CartContext`, `ViewsContext`/`viewQueries` (incl. `useCreateViewMutation`), and the `/ngviews` page with a *placeholder* Layer Cart tab. 5a builds the **checkout engine** and the **entry points** that feed it:
1. Hoist `CartProvider` so the file browser (not just `/ngviews`) can use it.
2. A pure `buildViewState()` that turns N resolved datasets into one Neuroglancer `ng_state` object + a `ViewLayerInput[]`, by reusing `omezarr-helper`'s existing per-dataset generators and merging their `layers`.
3. `useCartCheckout()` — resolves each dataset to a Data Link (reuse existing, else create), builds the state, and calls `createViewMutation`.
4. A reusable `CreateViewButton` that wraps checkout with the Data-Link **consent gate** (reusing the `areDataLinksAutomatic` preference).
5. Entry points: a row `⋯` **"Add to Neuroglancer cart"** item, a **floating selection bar** (first consumer of PR 3's `checkedFiles`), and the **full Layer Cart tab** (channel selection + Create View).

**This is PR 5a of a split PR 5.** PR 5b (a separate plan) adds the Browse-side right-edge **Properties↔Cart rail/drawer**, the **Data Link delete 409 dependent-Views dialog**, and the Properties **"Appears in N Views"** section. Branch `ngviews-05a-cart-pipeline` off `ngviews-04-views-page`; 5b stacks on 5a; the embedded-viewer PR (`ngviews-06-embedded-readonly`) stacks on 5b.

**Tech Stack:** React 18, TypeScript, TanStack Query v5, Material Tailwind v3, `zarrita`/`ome-zarr.js` (via `omezarr-helper.ts`), Vitest + RTL + MSW. All commands run through **pixi**.

## Global Constraints

- **Always use pixi.** Frontend tests `pixi run test-frontend`; type-check `pixi run node-check`; lint `pixi run node-eslint-check` (autofix `pixi run node-eslint-write`).
- **Branch:** all commits land on `ngviews-05a-cart-pipeline`, branched off **`ngviews-04-views-page`**. Create it first: `git checkout ngviews-04-views-page && git checkout -b ngviews-05a-cart-pipeline`. Every implementer must `git branch --show-current` == `ngviews-05a-cart-pipeline` **before committing** (a parallel session previously cross-contaminated branches). Never run repo-wide prettier/eslint autofix on untouched files; `git add` only the task's own files and confirm with `git show --stat HEAD`.
- **Pre-push (whoever pushes):** the Lefthook pre-push hook does NOT fire from `/opt/fileglancer`, so run `pixi run node-prettier-check` + `pixi run node-eslint-check` manually before pushing or CI will fail on formatting.
- **Reuse, do not rebuild** (exact identifiers verified in the codebase):
  - `useCartContext()` (`@/contexts/CartContext`) → `{ cart, cartCount, addToCart(items), removeFromCart(path, channel?), clearCart() }`; `CartItem = { fsp_name: string; path: string; channel?: string; label: string }` (defined/exported from `@/queries/preferencesQueries`, re-exported from CartContext).
  - `useViewsContext()` (`@/contexts/ViewsContext`) → `{ allViewsQuery, createViewMutation, updateViewMutation, deleteViewMutation }`. `createViewMutation.mutateAsync(req: ViewCreateRequest)`. `ViewCreateRequest = { name: string; ng_state: Record<string,unknown>; sharing_mode?: 'private'|'read'; layers: ViewLayerInput[] }`; `ViewLayerInput = { sharing_key: string|null; layer_index: number; channel: string|null; opts: Record<string,unknown>|null }` (`@/queries/viewQueries`).
  - Proxied paths: `useAllProxiedPathsQuery()` (list), `useCreateProxiedPathMutation()` → `mutateAsync({ fsp_name, path, url_prefix? }): Promise<ProxiedPath>`; `ProxiedPath` (`@/contexts/ProxiedPathContext`) has `{ sharing_key, url, fsp_name, path, ... }` (`@/queries/proxiedPathQueries`).
  - NG state: `getOmeZarrMetadata(dataUrl): Promise<Metadata>` and `generateNeuroglancerStateForOmeZarr(dataUrl, zarrVersion, layerType, multiscale, arr, labels, omero?, useLegacy?): string | null` and `generateNeuroglancerStateForDataURL(dataUrl, zarrVersion): string` — all exported from `@/omezarr-helper`. `Metadata` exposes `.multiscales?: MultiscaleMetadata[]`, `.arr`, `.labels?`, `.omero?`, `.zarrVersion: 2|3`. These generators return a **`encodeURIComponent(JSON.stringify(state))` string**, not an object.
  - Preferences/consent: `usePreferencesContext()` → `areDataLinksAutomatic: boolean`, `dataLinkSubpathMode`, `toggleAutomaticDataLinks(): Promise<Result<void>>`.
  - UI atoms: `FgButton`, `FgDialog` (`@/components/ui/Dialogs/FgDialog`), `FgBadge`, `FgSwitch`, `FgCheckbox`; Material Tailwind `Collapse` for the two-level cart tree (mirror `Sidebar/Zone.tsx`'s `openZones` controlled-open-map pattern — there is no generic TreeView).
  - Context menu: file-browser row items are `ContextMenuItem = { name; action: () => boolean|void|Promise<...>; shouldShow?; color? }` (`@/components/ui/Menus/ContextMenu.tsx`), defined in the items array inside `FileBrowser.tsx`.
- **`checkedFiles`/`checkedPaths`** come from `useFileBrowserContext().fileBrowserState` (PR 3). `checkedFiles: FileOrFolder[]` is the current directory's checked rows; `clearChecked()` empties the set; it auto-clears on navigation. The current FSP name is `fileQuery.data?.currentFileSharePath?.name`.
- **Read-only scope:** every created View uses `sharing_mode: 'read'` (the default). No edit link.
- **Frontend conventions** (`frontend/CLAUDE.md`): separate value/type imports; no `console.log` (use `src/logger.ts`); named React imports; define prop interfaces; do not annotate component return types.

**Interfaces this PR produces (consumed within 5a and by 5b/6):**
- `@/utils/viewCheckout`: `buildViewState(datasets: ResolvedCheckoutDataset[]): Promise<{ ng_state: Record<string,unknown>; layers: ViewLayerInput[] }>`; type `ResolvedCheckoutDataset`.
- `@/omezarr-helper`: `getOmeZarrChannels(dataUrl: string): Promise<string[]>`.
- `@/hooks/useCartCheckout`: `useCartCheckout()` → `{ checkout(datasets: CartItem[], name: string): Promise<View> }`.
- `@/components/ui/Views/CreateViewButton`: `<CreateViewButton datasets={CartItem[]} defaultName={string} onCreated?={(v: View) => void} … />`.

---

### Task 1: Hoist `CartProvider` app-wide

**Files:**
- Modify: `frontend/src/layouts/MainLayout.tsx` (mount `CartProvider` inside `PreferencesProvider`)
- Modify: `frontend/src/App.tsx` (remove the route-scoped `CartProvider` around `NGViews`; keep `ViewsProvider`)

**Interfaces:**
- Consumes: existing `CartProvider` (`@/contexts/CartContext`), which requires a `PreferencesProvider` ancestor (it calls `usePreferencesContext`).
- Produces: `useCartContext()` is now resolvable on **every** route under `MainLayout` (Browse included), not just `/ngviews`.

- [ ] **Step 1: Add `CartProvider` to `MainLayout`**

In `frontend/src/layouts/MainLayout.tsx`, import `CartProvider` and wrap it directly inside `PreferencesProvider` (so it has the preferences ancestor and covers both `<FileglancerNavbar/>` and `<Outlet/>`):

```tsx
import { CartProvider } from '@/contexts/CartContext';
```
```tsx
              <PreferencesProvider>
                <CartProvider>
                  <ExternalBucketProvider>
                    {/* …existing providers… */}
                    <MainLayoutContent />
                    {/* …/existing providers… */}
                  </ExternalBucketProvider>
                </CartProvider>
              </PreferencesProvider>
```
(Insert `CartProvider` as the child of `PreferencesProvider` and parent of the current `ExternalBucketProvider` subtree — do not reorder the others.)

- [ ] **Step 2: Remove the route-scoped `CartProvider`**

In `frontend/src/App.tsx`, the `/ngviews` route currently wraps `<CartProvider>` around `<NGViews/>`. Remove that wrapper (keep `ViewsProvider`), and remove the now-unused `CartProvider` import from `App.tsx`:

```tsx
              path="ngviews"
              element={
                <RequireAuth>
                  <ViewsProvider>
                    <NGViews />
                  </ViewsProvider>
                </RequireAuth>
              }
```

- [ ] **Step 3: Type-check, lint, full suite**

Run: `pixi run node-check`, `pixi run node-eslint-check`, `pixi run test-frontend`
Expected: green. `useCartCount` (nav badge) and the `/ngviews` cart tab keep working (both now resolve through the app-wide provider or the direct-preference read). The existing `NGViews.test.tsx` mocks `useCartContext`, so it is unaffected.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/layouts/MainLayout.tsx frontend/src/App.tsx
git commit -m "feat(views): mount CartProvider app-wide so the file browser can use the cart"
```

---

### Task 2: `getOmeZarrChannels` — list a dataset's channels

**Files:**
- Modify: `frontend/src/omezarr-helper.ts` (add + export `getOmeZarrChannels`)
- Test: `frontend/src/__tests__/unitTests/getOmeZarrChannels.test.ts` (new)

**Interfaces:**
- Consumes: existing `getOmeZarrMetadata(dataUrl)` and the axes helper `getAxesMap` (already in the file), `OmeroMetadata`, `MultiscaleMetadata`.
- Produces: `getOmeZarrChannels(dataUrl: string): Promise<string[]>` — the channel labels for an OME-Zarr dataset (from `omero.channels[].label`, else synthesized `Channel 0..n-1` from the `c` axis length, else `[]` when there is no channel axis).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unitTests/getOmeZarrChannels.test.ts`. Mock `getOmeZarrMetadata` (spy on the module) and assert channel extraction for three shapes: omero channels present; no omero but a `c` axis of length 3; no channel axis.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/omezarr-helper', async importOriginal => {
  const actual = await importOriginal<typeof import('@/omezarr-helper')>();
  return { ...actual, getOmeZarrMetadata: vi.fn() };
});

import { getOmeZarrChannels, getOmeZarrMetadata } from '@/omezarr-helper';

const asMock = getOmeZarrMetadata as unknown as ReturnType<typeof vi.fn>;

// Minimal Metadata-like fixtures. axes/omero/arr shapes only need the fields the helper reads.
const withOmero = {
  zarrVersion: 2,
  multiscales: [{ axes: [{ name: 'c' }, { name: 'y' }, { name: 'x' }] }],
  omero: { channels: [{ label: 'DAPI' }, { label: 'GFP' }] },
  arr: { shape: [2, 10, 10] }
};
const cAxisNoOmero = {
  zarrVersion: 2,
  multiscales: [{ axes: [{ name: 'c' }, { name: 'y' }, { name: 'x' }] }],
  omero: undefined,
  arr: { shape: [3, 10, 10] }
};
const noChannelAxis = {
  zarrVersion: 2,
  multiscales: [{ axes: [{ name: 'y' }, { name: 'x' }] }],
  omero: undefined,
  arr: { shape: [10, 10] }
};

describe('getOmeZarrChannels', () => {
  beforeEach(() => asMock.mockReset());

  it('reads omero channel labels', async () => {
    asMock.mockResolvedValue(withOmero);
    expect(await getOmeZarrChannels('u')).toEqual(['DAPI', 'GFP']);
  });
  it('synthesizes channel names from the c-axis length when omero is absent', async () => {
    asMock.mockResolvedValue(cAxisNoOmero);
    expect(await getOmeZarrChannels('u')).toEqual([
      'Channel 0',
      'Channel 1',
      'Channel 2'
    ]);
  });
  it('returns [] when there is no channel axis', async () => {
    asMock.mockResolvedValue(noChannelAxis);
    expect(await getOmeZarrChannels('u')).toEqual([]);
  });
});
```

> Read `omezarr-helper.ts` first: confirm the `Metadata` field names (`multiscales`, `omero`, `arr`, `zarrVersion`) and how `getAxesMap(multiscale)` returns `{ [axisName]: { index } }`. Match the fixtures to the real accessors your implementation uses.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pixi run test-frontend -- getOmeZarrChannels`
Expected: FAIL — `getOmeZarrChannels` not exported.

- [ ] **Step 3: Implement `getOmeZarrChannels`**

In `frontend/src/omezarr-helper.ts`, add the function and export it (append to the `export { … }` block). Reuse `getOmeZarrMetadata` and `getAxesMap`; mirror the channel logic already inside `generateFullNeuroglancerStateForOmeZarr` (omero channels first, else the `c`-axis count):

```ts
async function getOmeZarrChannels(dataUrl: string): Promise<string[]> {
  const metadata = await getOmeZarrMetadata(dataUrl);
  const multiscale = metadata.multiscales?.[0];
  if (!multiscale) {
    return [];
  }
  if (metadata.omero?.channels?.length) {
    return metadata.omero.channels.map(
      (ch, i) => ch.label || `Channel ${i}`
    );
  }
  const axesMap = getAxesMap(multiscale);
  const cAxis = axesMap['c'];
  if (!cAxis) {
    return [];
  }
  const count = metadata.arr.shape[cAxis.index];
  return Array.from({ length: count }, (_, i) => `Channel ${i}`);
}
```

Add `getOmeZarrChannels` to the exports.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pixi run test-frontend -- getOmeZarrChannels` → PASS.

- [ ] **Step 5: Type-check, lint, commit**

Run `pixi run node-check`, `pixi run node-eslint-check`. Then:
```bash
git add frontend/src/omezarr-helper.ts frontend/src/__tests__/unitTests/getOmeZarrChannels.test.ts
git commit -m "feat(views): add getOmeZarrChannels helper for cart channel selection"
```

---

### Task 3: `buildViewState` — multi-dataset `ng_state` object + layers

**Files:**
- Create: `frontend/src/utils/viewCheckout.ts`
- Test: `frontend/src/__tests__/unitTests/viewCheckout.test.ts` (new)

**Interfaces:**
- Consumes: `getOmeZarrMetadata`, `generateNeuroglancerStateForOmeZarr`, `generateNeuroglancerStateForDataURL` (`@/omezarr-helper`); `ViewLayerInput` (`@/queries/viewQueries`).
- Produces:
  - `type ResolvedCheckoutDataset = { url: string; sharing_key: string; fsp_name: string; path: string; channel?: string; label: string }`
  - `buildViewState(datasets: ResolvedCheckoutDataset[]): Promise<{ ng_state: Record<string, unknown>; layers: ViewLayerInput[] }>`

**Approach (lazy + grounded):** reuse the existing single-dataset generators (which are well-tested), then **merge**. For each dataset: fetch metadata, generate its state *string*, `JSON.parse(decodeURIComponent(...))` to an object, take its `layers`, (optionally) filter to the requested channel, and concatenate. Keep `dimensions`/`layout`/`selectedLayer` from the first dataset that produced them.
`// ponytail: merge per-dataset generated states instead of refactoring the generator to emit objects. Ceiling: cross-dataset coordinate spaces aren't reconciled (first dataset's dimensions win) and layer_index>4 is archived per NG default — fine for curated read-only carts; revisit if mixed-resolution overlays misalign.`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unitTests/viewCheckout.test.ts`. Mock `@/omezarr-helper` so `getOmeZarrMetadata` returns a minimal OME metadata and `generateNeuroglancerStateForOmeZarr` returns an encoded state with named layers; assert the merged `ng_state.layers` concatenates across datasets, `layer_index` is sequential, and each `ViewLayerInput` carries the right `sharing_key`/`channel`.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const encoded = (state: unknown) => encodeURIComponent(JSON.stringify(state));

vi.mock('@/omezarr-helper', () => ({
  getOmeZarrMetadata: vi.fn(),
  generateNeuroglancerStateForOmeZarr: vi.fn(),
  generateNeuroglancerStateForDataURL: vi.fn()
}));

import {
  getOmeZarrMetadata,
  generateNeuroglancerStateForOmeZarr
} from '@/omezarr-helper';
import { buildViewState } from '@/utils/viewCheckout';

const md = { multiscales: [{}], arr: {}, zarrVersion: 2 };

beforeEach(() => {
  (getOmeZarrMetadata as any).mockReset().mockResolvedValue(md);
  (generateNeuroglancerStateForOmeZarr as any)
    .mockReset()
    .mockImplementation((url: string) =>
      encoded({
        dimensions: { x: [1, 'm'] },
        layout: '4panel-alt',
        layers: [{ name: `${url}-L0`, type: 'image' }]
      })
    );
});

describe('buildViewState', () => {
  it('concatenates layers across datasets and maps ViewLayerInput', async () => {
    const { ng_state, layers } = await buildViewState([
      { url: 'a', sharing_key: 'ka', fsp_name: 'f', path: '/a', label: 'A' },
      {
        url: 'b',
        sharing_key: 'kb',
        fsp_name: 'f',
        path: '/b',
        channel: 'GFP',
        label: 'B'
      }
    ]);
    const stateLayers = (ng_state as any).layers;
    expect(stateLayers).toHaveLength(2);
    expect((ng_state as any).dimensions).toEqual({ x: [1, 'm'] }); // first dataset's dims kept
    expect(layers).toEqual([
      { sharing_key: 'ka', layer_index: 0, channel: null, opts: null },
      { sharing_key: 'kb', layer_index: 1, channel: 'GFP', opts: null }
    ]);
  });

  it('falls back to the data-URL generator when there are no multiscales', async () => {
    (getOmeZarrMetadata as any).mockResolvedValue({
      multiscales: undefined,
      arr: {},
      zarrVersion: 2
    });
    (
      (await import('@/omezarr-helper')).generateNeuroglancerStateForDataURL as any
    ).mockReturnValue(encoded({ layers: [{ name: 'fallback' }] }));
    const { ng_state } = await buildViewState([
      { url: 'a', sharing_key: 'ka', fsp_name: 'f', path: '/a', label: 'A' }
    ]);
    expect((ng_state as any).layers).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pixi run test-frontend -- viewCheckout` → FAIL (module missing).

- [ ] **Step 3: Implement `viewCheckout.ts`**

```ts
import {
  getOmeZarrMetadata,
  generateNeuroglancerStateForOmeZarr,
  generateNeuroglancerStateForDataURL
} from '@/omezarr-helper';
import type { ViewLayerInput } from '@/queries/viewQueries';
import log from '@/logger';

export type ResolvedCheckoutDataset = {
  url: string;
  sharing_key: string;
  fsp_name: string;
  path: string;
  channel?: string;
  label: string;
};

type NgLayer = Record<string, unknown> & { name?: string };
type NgState = Record<string, unknown> & { layers?: NgLayer[] };

function decodeState(encoded: string | null): NgState | null {
  if (!encoded) {
    return null;
  }
  try {
    return JSON.parse(decodeURIComponent(encoded)) as NgState;
  } catch (error) {
    log.error('Failed to decode generated Neuroglancer state', error);
    return null;
  }
}

async function generateStateForDataset(
  ds: ResolvedCheckoutDataset
): Promise<NgState | null> {
  const metadata = await getOmeZarrMetadata(ds.url);
  const multiscale = metadata.multiscales?.[0];
  // ponytail: default layerType 'image' — the thumbnail-edge heuristic used
  // for the single-dir preview needs a rendered thumbnail we don't have here.
  const encoded = multiscale
    ? generateNeuroglancerStateForOmeZarr(
        ds.url,
        metadata.zarrVersion,
        'image',
        multiscale,
        metadata.arr,
        metadata.labels,
        metadata.omero
      )
    : generateNeuroglancerStateForDataURL(ds.url, metadata.zarrVersion);
  return decodeState(encoded);
}

// If the cart entry names a channel, keep only layers whose name matches it;
// otherwise keep every layer the dataset produced.
function selectLayers(state: NgState, channel?: string): NgLayer[] {
  const layers = state.layers ?? [];
  if (!channel) {
    return layers;
  }
  const matched = layers.filter(l =>
    (l.name ?? '').toString().toLowerCase().includes(channel.toLowerCase())
  );
  return matched.length ? matched : layers;
}

export async function buildViewState(
  datasets: ResolvedCheckoutDataset[]
): Promise<{ ng_state: Record<string, unknown>; layers: ViewLayerInput[] }> {
  const combinedLayers: NgLayer[] = [];
  const viewLayers: ViewLayerInput[] = [];
  let base: NgState | null = null;

  for (const ds of datasets) {
    const state = await generateStateForDataset(ds);
    if (!state) {
      continue;
    }
    if (!base) {
      base = state;
    }
    for (const layer of selectLayers(state, ds.channel)) {
      const layer_index = combinedLayers.length;
      combinedLayers.push({ ...layer, archived: layer_index >= 4 });
      viewLayers.push({
        sharing_key: ds.sharing_key,
        layer_index,
        channel: ds.channel ?? null,
        opts: null
      });
    }
  }

  const first = combinedLayers[0];
  const ng_state: Record<string, unknown> = {
    ...(base ?? {}),
    layers: combinedLayers,
    selectedLayer: first ? { visible: true, layer: first.name } : undefined,
    layout: (base?.layout as string) ?? '4panel-alt'
  };
  return { ng_state, layers: viewLayers };
}
```

> Confirm `@/logger`'s default export name matches your import (the repo uses `src/logger.ts`). If `Metadata.zarrVersion` is typed as `2 | 3`, the generator calls type-check directly; if the field name differs, adjust to the real one.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pixi run test-frontend -- viewCheckout` → PASS (both cases).

- [ ] **Step 5: Type-check, lint, commit**

```bash
git add frontend/src/utils/viewCheckout.ts frontend/src/__tests__/unitTests/viewCheckout.test.ts
git commit -m "feat(views): add buildViewState to assemble ng_state from multiple datasets"
```

---

### Task 4: `useCartCheckout` — resolve Data Links + build state + create View

**Files:**
- Create: `frontend/src/hooks/useCartCheckout.ts`
- Test: `frontend/src/__tests__/componentTests/useCartCheckout.test.tsx` (new)

**Interfaces:**
- Consumes: `useAllProxiedPathsQuery`, `useCreateProxiedPathMutation` (`@/queries/proxiedPathQueries`); `useViewsContext().createViewMutation`; `buildViewState` (Task 3); `CartItem` (`@/queries/preferencesQueries`); `normalizeFspRootPath` if present in `@/utils` (FSP-root `.` → `''`, matching `useDataToolLinks.handleCreateDataLink`).
- Produces: `useCartCheckout() → { checkout(datasets: CartItem[], name: string): Promise<View> }`. `checkout` (a) resolves a Data Link per unique `(fsp_name, path)` — reusing an existing proxied path from the list, else creating one — (b) maps each cart entry to a `ResolvedCheckoutDataset` (carrying its channel), (c) `buildViewState`, (d) `createViewMutation.mutateAsync({ name, ng_state, layers })`, (e) returns the `View`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/componentTests/useCartCheckout.test.tsx`. Mock the proxied-path hooks, `useViewsContext`, and `buildViewState`; render the hook with `renderHook` inside a `QueryClientProvider`; assert that checkout creates links only for datasets without an existing proxied path, and calls `createViewMutation.mutateAsync` with the built state.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const createProxied = vi.fn();
const createViewAsync = vi.fn();

vi.mock('@/queries/proxiedPathQueries', () => ({
  useAllProxiedPathsQuery: () => ({
    data: [{ fsp_name: 'f', path: '/a', sharing_key: 'ka', url: 'http://a' }]
  }),
  useCreateProxiedPathMutation: () => ({ mutateAsync: createProxied })
}));
vi.mock('@/contexts/ViewsContext', () => ({
  useViewsContext: () => ({
    createViewMutation: { mutateAsync: createViewAsync }
  })
}));
vi.mock('@/utils/viewCheckout', () => ({
  buildViewState: vi.fn().mockResolvedValue({
    ng_state: { layers: [] },
    layers: [{ sharing_key: 'ka', layer_index: 0, channel: null, opts: null }]
  })
}));

import { useCartCheckout } from '@/hooks/useCartCheckout';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  createProxied.mockReset().mockResolvedValue({
    fsp_name: 'f',
    path: '/b',
    sharing_key: 'kb',
    url: 'http://b'
  });
  createViewAsync.mockReset().mockResolvedValue({ short_key: 'v1', name: 'N' });
});

describe('useCartCheckout', () => {
  it('reuses existing links, creates missing ones, then creates the View', async () => {
    const { result } = renderHook(() => useCartCheckout(), { wrapper });
    await result.current.checkout(
      [
        { fsp_name: 'f', path: '/a', label: 'A' }, // existing link → no create
        { fsp_name: 'f', path: '/b', label: 'B' } // missing → create
      ],
      'My View'
    );
    expect(createProxied).toHaveBeenCalledTimes(1);
    expect(createProxied).toHaveBeenCalledWith(
      expect.objectContaining({ fsp_name: 'f', path: '/b' })
    );
    expect(createViewAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My View', ng_state: { layers: [] } })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pixi run test-frontend -- useCartCheckout` → FAIL.

- [ ] **Step 3: Implement `useCartCheckout.ts`**

```tsx
import { useCallback } from 'react';

import {
  useAllProxiedPathsQuery,
  useCreateProxiedPathMutation
} from '@/queries/proxiedPathQueries';
import { useViewsContext } from '@/contexts/ViewsContext';
import { buildViewState } from '@/utils/viewCheckout';
import type { ResolvedCheckoutDataset } from '@/utils/viewCheckout';
import type { CartItem } from '@/queries/preferencesQueries';
import type { View } from '@/queries/viewQueries';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';

const datasetKey = (fsp_name: string, path: string) => `${fsp_name}::${path}`;

export function useCartCheckout() {
  const allProxiedPathsQuery = useAllProxiedPathsQuery();
  const createProxiedPath = useCreateProxiedPathMutation();
  const { createViewMutation } = useViewsContext();

  const checkout = useCallback(
    async (datasets: CartItem[], name: string): Promise<View> => {
      const existing = new Map<string, ProxiedPath>(
        (allProxiedPathsQuery.data ?? []).map(p => [
          datasetKey(p.fsp_name, p.path),
          p
        ])
      );

      // Resolve one Data Link per unique (fsp_name, path); create if missing.
      const linkByKey = new Map<string, ProxiedPath>();
      for (const ds of datasets) {
        const key = datasetKey(ds.fsp_name, ds.path);
        if (linkByKey.has(key)) {
          continue;
        }
        const link =
          existing.get(key) ??
          (await createProxiedPath.mutateAsync({
            fsp_name: ds.fsp_name,
            path: ds.path
          }));
        linkByKey.set(key, link);
      }

      const resolved: ResolvedCheckoutDataset[] = datasets.map(ds => {
        const link = linkByKey.get(datasetKey(ds.fsp_name, ds.path))!;
        return {
          url: link.url,
          sharing_key: link.sharing_key,
          fsp_name: ds.fsp_name,
          path: ds.path,
          channel: ds.channel,
          label: ds.label
        };
      });

      const { ng_state, layers } = await buildViewState(resolved);
      return createViewMutation.mutateAsync({ name, ng_state, layers });
    },
    [allProxiedPathsQuery.data, createProxiedPath, createViewMutation]
  );

  return { checkout };
}
```

> Verify `ProxiedPath.path` is stored the same way you look it up (the create path uses `normalizeFspRootPath`; if the list stores normalized paths, normalize `ds.path` the same way before `datasetKey`, or matches will miss and you'll create duplicate links). Read `proxiedPathQueries.ts` + `useDataToolLinks.handleCreateDataLink` and mirror its `path` normalization.

- [ ] **Step 4: Run the test to verify it passes → Step 5: type-check, lint, commit**

Run `pixi run test-frontend -- useCartCheckout` (PASS), `pixi run node-check`, `pixi run node-eslint-check`.
```bash
git add frontend/src/hooks/useCartCheckout.ts frontend/src/__tests__/componentTests/useCartCheckout.test.tsx
git commit -m "feat(views): add useCartCheckout (resolve links, build state, create View)"
```

---

### Task 5: `CreateViewButton` — consent-gated checkout, reused everywhere

**Files:**
- Create: `frontend/src/components/ui/Views/CreateViewButton.tsx`
- Test: `frontend/src/__tests__/componentTests/CreateViewButton.test.tsx` (new)

**Interfaces:**
- Consumes: `useCartCheckout` (Task 4); `usePreferencesContext()` (`areDataLinksAutomatic`, `dataLinkSubpathMode`, `toggleAutomaticDataLinks`); `useAllProxiedPathsQuery` (to count links that would be newly created); `FgButton`, `FgDialog`, `FgSwitch`; `toast`; `useNavigate` (`react-router`); `CartItem`, `View`.
- Produces: `<CreateViewButton datasets={CartItem[]} defaultName={string} label?={string} disabled?={boolean} onCreated?={(v: View) => void} />`. On click: if `datasets` empty → `toast.error('Nothing to add')`; else compute `newLinkCount` (datasets whose `(fsp_name,path)` has no existing proxied path); if `areDataLinksAutomatic` (and subpath mode not `'custom'`) **or** `newLinkCount === 0` → run checkout directly; else open a consent `FgDialog`. Consent dialog mirrors `DataLink.tsx`'s copy: a warning ("This will create N data links and 1 View"), a **"Don't ask me this again"** `FgSwitch` wired to `toggleAutomaticDataLinks()`, and Create/Cancel. On confirm → checkout. On success → `toast.success`, `onCreated?.(view)` (default: `navigate('/ngviews')`).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/componentTests/CreateViewButton.test.tsx`. Mock `useCartCheckout` (spy `checkout`), `usePreferencesContext`, `useAllProxiedPathsQuery`, `react-router`'s `useNavigate`. Two cases: (a) `areDataLinksAutomatic=true` → clicking "Create View" calls `checkout` immediately (no dialog); (b) `areDataLinksAutomatic=false` with a dataset needing a new link → clicking opens the consent dialog, and confirming calls `checkout`.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const checkout = vi.fn().mockResolvedValue({ short_key: 'v1', name: 'N' });
let automatic = true;

vi.mock('@/hooks/useCartCheckout', () => ({
  useCartCheckout: () => ({ checkout })
}));
vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({
    areDataLinksAutomatic: automatic,
    dataLinkSubpathMode: 'full_path',
    toggleAutomaticDataLinks: vi.fn()
  })
}));
vi.mock('@/queries/proxiedPathQueries', () => ({
  useAllProxiedPathsQuery: () => ({ data: [] }) // nothing exists → 1 new link
}));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));

import CreateViewButton from '@/components/ui/Views/CreateViewButton';

const datasets = [{ fsp_name: 'f', path: '/a', label: 'A' }];

beforeEach(() => {
  checkout.mockClear();
  automatic = true;
});

describe('CreateViewButton', () => {
  it('checks out directly when data links are automatic', async () => {
    const user = userEvent.setup();
    render(<CreateViewButton datasets={datasets} defaultName="V" />);
    await user.click(screen.getByRole('button', { name: /create view/i }));
    expect(checkout).toHaveBeenCalledWith(datasets, 'V');
  });

  it('shows a consent dialog when not automatic, then checks out on confirm', async () => {
    automatic = false;
    const user = userEvent.setup();
    render(<CreateViewButton datasets={datasets} defaultName="V" />);
    await user.click(screen.getByRole('button', { name: /create view/i }));
    expect(checkout).not.toHaveBeenCalled();
    // consent dialog visible → confirm
    await user.click(
      await screen.findByRole('button', { name: /create.*view|confirm|continue/i })
    );
    expect(checkout).toHaveBeenCalledWith(datasets, 'V');
  });
});
```

- [ ] **Step 2: Run to verify it fails → Step 3: implement `CreateViewButton.tsx`**

Implement per the Produces contract. Use `FgDialog` for the consent modal (mirror the delete-dialog pattern in `NGViews.tsx`), `FgSwitch` for "Don't ask again" (call `toggleAutomaticDataLinks()`), and a `useState` pending flag disabling the button during `checkout`. Compute `newLinkCount` by comparing `datasets` against `useAllProxiedPathsQuery().data` on `(fsp_name, path)`. On success `toast.success(\`Created View "\${name}"\`)` and `onCreated?.(view) ?? navigate('/ngviews')`; on error `toast.error(...)`.

> Read `DataLink.tsx` (the "NOT automatic" branch, ~lines 277-346) to match the consent copy and the `DataLinkOptions`/`FgSwitch` "don't ask again" wiring, so this dialog is consistent with the existing one. Do NOT import `DataLink.tsx` directly — it's a single-link discriminated-union dialog; this is the batch equivalent.

- [ ] **Step 4: test PASS → Step 5: type-check, lint, commit**

```bash
git add frontend/src/components/ui/Views/CreateViewButton.tsx frontend/src/__tests__/componentTests/CreateViewButton.test.tsx
git commit -m "feat(views): add consent-gated CreateViewButton (batch checkout)"
```

---

### Task 6: Row `⋯` "Add to Neuroglancer cart"

**Files:**
- Modify: `frontend/src/components/ui/BrowsePage/FileBrowser.tsx` (add a context-menu item)
- Test: extend/add `frontend/src/__tests__/componentTests/FileBrowserCartItem.test.tsx` (new)

**Interfaces:**
- Consumes: `useCartContext().addToCart` (now app-wide, Task 1); the context-menu items array in `FileBrowser.tsx`; the current FSP name from `fileQuery.data?.currentFileSharePath?.name`; `ContextMenuItem` shape.
- Produces: a new row/right-click menu item **"Add to Neuroglancer cart"** that calls `addToCart([{ fsp_name, path: file.path, label: file.name }])` and `toast.success`. `shouldShow`: only for folders (datasets), not broken symlinks — mirror the guard the existing NG/data-link items use.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/componentTests/FileBrowserCartItem.test.tsx`. Render the Browse page through the shared `render` harness (mirror `Browse.test.tsx`'s MSW file-listing handler so a directory with a folder loads), open a row's context menu, and assert an "Add to Neuroglancer cart" item exists and clicking it calls the cart. If wiring the whole Browse tree is brittle, fall back to a focused test that mocks `useCartContext` and asserts the item's `action` builds the right `CartItem` — assert the behavior (a folder row yields `addToCart([{fsp_name, path, label}])`), not the DOM mechanics.

- [ ] **Step 2: fail → Step 3: add the menu item**

In `FileBrowser.tsx`, find the context-menu items array (the `ContextMenuItem[]` built for a right-clicked/`⋯` file) and add:

```tsx
{
  name: 'Add to Neuroglancer cart',
  shouldShow: file.is_dir === true && !file.is_broken_symlink, // match the real FileOrFolder flags
  action: () => {
    addToCart([
      {
        fsp_name: fileQuery.data?.currentFileSharePath?.name ?? '',
        path: file.path,
        label: file.name
      }
    ]);
    toast.success(`Added "${file.name}" to the Neuroglancer cart`);
  }
}
```

Pull `addToCart` from `useCartContext()` and `toast` from `react-hot-toast` (verify the real `FileOrFolder` field names — `is_dir`/`is_broken_symlink` may differ; read the type and mirror the guard the existing Neuroglancer/data-link menu items use).

- [ ] **Step 4: PASS → Step 5: type-check, lint, commit**

```bash
git add frontend/src/components/ui/BrowsePage/FileBrowser.tsx frontend/src/__tests__/componentTests/FileBrowserCartItem.test.tsx
git commit -m "feat(browse): add \"Add to Neuroglancer cart\" row action"
```

---

### Task 7: Floating selection bar (first consumer of `checkedFiles`)

**Files:**
- Create: `frontend/src/components/ui/BrowsePage/SelectionBar.tsx`
- Modify: `frontend/src/components/ui/BrowsePage/FileBrowser.tsx` (render `<SelectionBar/>` when rows are checked)
- Test: `frontend/src/__tests__/componentTests/SelectionBar.test.tsx` (new)

**Interfaces:**
- Consumes: `useFileBrowserContext().fileBrowserState.checkedFiles` + `clearChecked`; `fileQuery.data?.currentFileSharePath?.name`; `useCartContext().addToCart`; `CreateViewButton` (Task 5); `FgButton`.
- Produces: a fixed, bottom-center bar rendered only when `checkedFiles.length > 0`, showing the count and three actions: **Add N to cart** (`addToCart(checkedFiles.map(f => ({ fsp_name, path: f.path, label: f.name })))` + toast), **New View from selection** (`<CreateViewButton datasets={selectionDatasets} defaultName="New View" label="New View from selection" />`), **Clear** (`clearChecked()`).
  `// ponytail: bar carries the two net-new cart actions + clear. Multi-select Share/Download/"More" (design §6) generalize existing single-file actions — deferred; add when a concrete need lands.`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/componentTests/SelectionBar.test.tsx`. Mock `useFileBrowserContext` (return two `checkedFiles`, a `clearChecked` spy, and `fileQuery.data.currentFileSharePath.name`), `useCartContext` (spy `addToCart`), and `CreateViewButton` (a stub rendering a button). Assert: the bar shows "2 selected", "Add 2 to cart" calls `addToCart` with two mapped items, and "Clear" calls `clearChecked`.

- [ ] **Step 2: fail → Step 3: implement `SelectionBar.tsx`** per the contract; a fixed-position (`fixed bottom-6 left-1/2 -translate-x-1/2 z-…`) rounded bar of `FgButton`s. Render nothing when `checkedFiles.length === 0`.

- [ ] **Step 4: render it** in `FileBrowser.tsx` (once, near the table). It self-hides when nothing is checked, so an unconditional mount is fine.

- [ ] **Step 5: PASS, type-check, lint, full suite, commit**

Run `pixi run test-frontend -- SelectionBar`, then `pixi run node-check`, `pixi run node-eslint-check`, `pixi run test-frontend` (full — the FileBrowser edit is on a shared surface).
```bash
git add frontend/src/components/ui/BrowsePage/SelectionBar.tsx frontend/src/components/ui/BrowsePage/FileBrowser.tsx frontend/src/__tests__/componentTests/SelectionBar.test.tsx
git commit -m "feat(browse): floating selection bar (add to cart / new View from selection)"
```

---

### Task 8: Full Layer Cart tab (channel selection + Create View)

**Files:**
- Modify: `frontend/src/components/NGViews.tsx` (replace the placeholder cart shell)
- Create: `frontend/src/components/ui/Views/CartDatasetRow.tsx` (one expandable dataset row)
- Test: `frontend/src/__tests__/componentTests/CartTab.test.tsx` (new)

**Interfaces:**
- Consumes: `useCartContext()` (`cart`, `addToCart`, `removeFromCart`, `clearCart`); `getOmeZarrChannels` (Task 2) for lazy channel discovery; `useCreateProxiedPathMutation`/`useAllProxiedPathsQuery` **only** indirectly (channel discovery needs the dataset's data-link URL — reuse the existing proxied path if present, else fall back to disabling channel expansion with a hint); `CreateViewButton` (Task 5); Material Tailwind `Collapse` + a chevron (mirror `Sidebar/Zone.tsx`).
- Produces: the Layer Cart tab renders the cart grouped by dataset `(fsp_name, path)`. Each dataset row: label, a remove button, and an expander that **lazy-loads channels** (`getOmeZarrChannels(url)` on first expand) and shows a checkbox per channel; checking a channel adds a channel-specific `CartItem` (`addToCart([{ …, channel }])`), unchecking removes it (`removeFromCart(path, channel)`). Below the list: `<CreateViewButton datasets={cart} defaultName="New View" label="Create View" />` and a **Clear cart** button.
  `// ponytail: two-level dataset→channel tree via MT Collapse (no generic TreeView exists). Channel URL comes from an existing Data Link; if a dataset has no link yet, disable expansion with "channels load after the View is created" rather than creating a link just to browse channels. Non-Zarr/N5 disabling (design §6) deferred to the row's channel-load erroring out gracefully.`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/componentTests/CartTab.test.tsx`. Mock `useCartContext` (a two-item cart + spies), `useViewsContext`, `getOmeZarrChannels` (resolve `['DAPI','GFP']`), and `CreateViewButton` (stub). Render `NGViews`, switch to the Layer Cart tab, and assert: both datasets are listed; expanding one calls `getOmeZarrChannels` and shows the channels; a "Create View" control is present. (Mirror the existing `NGViews.test.tsx` mocking setup.)

- [ ] **Step 2: fail → Step 3: implement `CartDatasetRow.tsx` + rewire the cart tab** in `NGViews.tsx`, replacing the placeholder `else` block (the one marked `{/* Create View checkout + Fiji-style tree land in PR 5. */}`). Group `cart` by `(fsp_name, path)`; render a `CartDatasetRow` per dataset (its own `Collapse` open-state + a lazily-fetched `channels` state); footer with `CreateViewButton` + Clear cart. Keep the Saved Views tab untouched.

- [ ] **Step 4: PASS, type-check, lint, full suite, commit**

Run `pixi run test-frontend -- CartTab`, then `pixi run node-check`, `pixi run node-eslint-check`, `pixi run test-frontend` (full).
```bash
git add frontend/src/components/NGViews.tsx frontend/src/components/ui/Views/CartDatasetRow.tsx frontend/src/__tests__/componentTests/CartTab.test.tsx
git commit -m "feat(views): full Layer Cart tab with channel selection + Create View"
```

---

## Self-Review

**Spec coverage (design §6/§8 PR 5, cart-pipeline portion):**
- Layer Cart server-side per-user + checkout → creates a View ✓ (Tasks 3–4, 8; cart persistence shipped in PR 4).
- Multi-select selection bar (add to cart · New View from selection) ✓ (Task 7) — first consumer of PR 3's `checkedFiles`.
- Row `⋯` "Add to Neuroglancer cart" ✓ (Task 6). Row `⋯` "View in Neuroglancer" (scratch View) → **deferred to PR 6** (it needs the embedded viewer; noted in Out-of-scope).
- Data-link consent reuse for View-creating actions ✓ (Task 5, `areDataLinksAutomatic` gate + "don't ask again" via `toggleAutomaticDataLinks`).
- Full Layer Cart tab: two-level dataset+channel tree, lazy channel load, Create View ✓ (Task 8); non-Zarr/N5 hard-disable simplified to graceful channel-load failure (ponytail-noted).
- Cart count badges already ship (PR 4 nav badge + cart-tab badge).

**Deferred to PR 5b (separate plan):** right-edge Properties↔Cart rail + Browse-side cart drawer; Data Link delete 409 dependent-Views dialog; Properties "Appears in N Views". Deferred to PR 6: embedded viewer + scratch "View in Neuroglancer" row item + repointing "Open".

**Placeholder scan:** none — every code step has real code or a named reference file to verify against (the `omezarr-helper` field names, `ProxiedPath.path` normalization, `FileOrFolder` flags, `@/logger` export). These are verification points, not logic gaps.

**Type consistency:** `CartItem` (fsp_name/path/channel?/label) flows unchanged from cart → `useCartCheckout.checkout(datasets, name)` → `ResolvedCheckoutDataset` (adds url/sharing_key) → `buildViewState` → `ViewLayerInput[]` → `ViewCreateRequest`. `CreateViewButton` takes `CartItem[]` and is fed by both the selection bar (`checkedFiles` mapped to `CartItem`) and the cart tab (`cart`). `checkout` returns `View`; `onCreated?(view: View)`.

**Ambiguity check:** the checkout engine is shared by "Create View" (cart tab) and "New View from selection" (selection bar) via one `CreateViewButton`/`useCartCheckout` — no duplicated checkout logic. Data Links are resolved once per unique `(fsp_name, path)` even when multiple channels of the same dataset are in the cart. The consent gate fires only when a checkout would create ≥1 new link and `areDataLinksAutomatic` is off.

## Risks / call-outs for the executor

- **`buildViewState` merge is a heuristic** (first dataset's `dimensions`/`layout` win; layers concatenated; channel filter by name match). This is the intended read-only-first behavior; a mixed-resolution overlay may not co-register. Flagged with a `ponytail:` ceiling comment — do not gold-plate it in 5a.
- **`ProxiedPath.path` normalization** is the one correctness trap: if the cart stores `path` differently from how the proxied-path list stores it, `useCartCheckout` will create duplicate links. Task 4 step 3 calls this out explicitly — verify against `useDataToolLinks.handleCreateDataLink`.
- **Channel discovery needs a data-link URL.** In the cart tab, a dataset with no existing Data Link can't be browsed for channels without creating one. Task 8 disables expansion with a hint rather than creating links on browse — confirm that's acceptable UX, or (5b) create the links at add-to-cart time.

## Out of scope for this PR (next plans)

- **PR 5b `ngviews-05b-browser-chrome`:** right-edge Properties↔Cart rail + Browse cart drawer; Data Link delete 409 dependent-Views dialog (the backend already returns `409 {"detail": {message, dependent_views}}` + accepts `confirm`); Properties "Appears in N Views" (`GET /api/proxied-path/{sharing_key}/views`).
- **PR 6 `ngviews-06-embedded-readonly`:** the embedded `/ngview/:key` viewer; scratch "View in Neuroglancer" row item; repointing the Saved Views "Open" action from external NG to the embedded route.
