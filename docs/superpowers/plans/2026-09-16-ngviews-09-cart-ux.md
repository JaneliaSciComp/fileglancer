# ngviews-09 Cart UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Layer Cart the single path to a View: show per-dataset "will this be a Neuroglancer layer?" status in the cart, count datasets (not channels) on the badge, open the cart when something is added, drop the shortcut buttons that bypass the cart, and focus the name field in Create View.

**Architecture:** Frontend only. Dataset classification is extracted from the checkout path into `probeDataset` so the cart and checkout agree by construction; `useCartDimensionCheck` becomes the cart's single metadata query and also reports the kind. Drawer opening is a new non-toggling `openDrawer` on `useLayoutPrefs`, reached through the existing router outlet context.

**Tech Stack:** React 18, TanStack Query v5, react-router, Material Tailwind, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-16-ngviews-dev-feedback-design.md` (Branch 09 section).

## Global Constraints

- Always run tools through pixi.
- Branch: `git checkout -b ngviews-09-cart-ux ngviews-08-broken-source-tracking`.
- User-facing copy says "cart" and "View", never "Neuroglancer cart" or "NG View".
- Do not add dependencies. Icons come from `react-icons` (already installed).
- Run `pixi run node-prettier-write` and `pixi run node-eslint-check` before each commit; Lefthook does not fire from `/opt/fileglancer`.

---

### Task 1: Badge counts unique datasets

**Files:**
- Modify: `frontend/src/hooks/useCartCount.ts`
- Test: `frontend/src/__tests__/componentTests/NavbarBadge.test.tsx`

**Interfaces:**
- Produces: `useCartCount(): number` (unchanged signature, new semantics: unique `datasetKey`).

- [ ] **Step 1: Write the failing test**

In `NavbarBadge.test.tsx`, find how the preference data is mocked (the `neuroglancerCart` array). Add a test that feeds a base entry plus two channel entries for the same dataset and one other dataset:

```ts
it('counts datasets, not channel entries', () => {
  setCart([
    { fsp_name: 'f', path: '/a.zarr', label: 'a' },
    { fsp_name: 'f', path: '/a.zarr', label: 'DAPI', channel: 'DAPI', channelIndex: 0 },
    { fsp_name: 'f', path: '/a.zarr', label: 'GFP', channel: 'GFP', channelIndex: 1 },
    { fsp_name: 'f', path: '/b.zarr', label: 'b' }
  ]); // use the file's existing helper for setting the mocked preference
  renderBadge();
  expect(screen.getByText('2')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pixi run test-frontend -- NavbarBadge`
Expected: FAIL (badge shows 4).

- [ ] **Step 3: Implement**

```ts
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { datasetKey } from '@/utils/pathHandling';

// ponytail: nav badge reads the preference directly, not CartContext — avoids
// wrapping the whole app in CartProvider just for a count.
// Counts datasets (cart rows), not per-channel entries.
export function useCartCount(): number {
  const { preferenceQuery } = usePreferencesContext();
  const items = preferenceQuery.data?.neuroglancerCart ?? [];
  return new Set(items.map(i => datasetKey(i.fsp_name, i.path))).size;
}
```

- [ ] **Step 4: Run tests**

Run: `pixi run test-frontend -- NavbarBadge`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useCartCount.ts frontend/src/__tests__/componentTests/NavbarBadge.test.tsx
git commit -m "fix(views): cart badge counts datasets, not channel selections"
```

---

### Task 2: Remove "New View from selection" from the floating bar

**Files:**
- Modify: `frontend/src/components/ui/BrowsePage/SelectionBar.tsx`
- Test: `frontend/src/__tests__/componentTests/SelectionBar.test.tsx`

- [ ] **Step 1: Update the test**

In `SelectionBar.test.tsx`: delete the `vi.mock('@/components/ui/Views/CreateViewButton', ...)` block, the `createdView` fixture, and any test that clicks "New View from selection" or asserts on `navigate`. Add:

```ts
it('does not offer a create-view shortcut; the cart is the only path', () => {
  render(<SelectionBar />);
  expect(screen.queryByText(/New View/)).not.toBeInTheDocument();
  expect(screen.getByText('Add 2 to cart')).toBeInTheDocument();
});
```

Keep the `react-router` mock for now; Task 3 replaces it.

- [ ] **Step 2: Run to confirm failure**

Run: `pixi run test-frontend -- SelectionBar`
Expected: the new test FAILS (button present).

- [ ] **Step 3: Remove the button**

In `SelectionBar.tsx` remove the `CreateViewButton` import, the `useNavigate` import and `navigate` variable, and the `<CreateViewButton .../>` element. Update the header comment to:

```ts
// ponytail: bar carries "add to cart" + clear only. Creating a View goes
// through the cart so the user sees per-dataset layer status first.
```

- [ ] **Step 4: Run tests and lint**

Run: `pixi run test-frontend -- SelectionBar && pixi run node-eslint-check`
Expected: PASS, no unused-import errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/BrowsePage/SelectionBar.tsx frontend/src/__tests__/componentTests/SelectionBar.test.tsx
git commit -m "feat(views): remove New View from selection; the cart is the only path to a View"
```

---

### Task 3: "Add to cart" opens the cart drawer; context-menu copy

**Files:**
- Modify: `frontend/src/hooks/useLayoutPrefs.ts:68-77, 260-268`
- Modify: `frontend/src/layouts/BrowseLayout.tsx:13-24, 31-52`
- Modify: `frontend/src/components/ui/BrowsePage/SelectionBar.tsx`
- Modify: `frontend/src/components/ui/BrowsePage/FileBrowser.tsx:24, 69-70, 199-249, 398`
- Delete: `frontend/src/__tests__/componentTests/FileBrowserViewInNg.test.tsx`
- Test: `frontend/src/__tests__/componentTests/SelectionBar.test.tsx`, `frontend/src/__tests__/componentTests/FileBrowserCartItem.test.tsx`

**Interfaces:**
- Produces: `openDrawer(mode: 'properties' | 'cart'): void` on `useLayoutPrefs()` return and on `OutletContextType`.

- [ ] **Step 1: Write the failing tests**

`SelectionBar.test.tsx`: replace the `react-router` mock with

```ts
const openDrawer = vi.hoisted(() => vi.fn());
vi.mock('react-router', () => ({ useOutletContext: () => ({ openDrawer }) }));
```

and add:

```ts
it('opens the cart drawer after adding the selection', async () => {
  render(<SelectionBar />);
  await userEvent.click(screen.getByText('Add 2 to cart'));
  expect(addToCart).toHaveBeenCalled();
  expect(openDrawer).toHaveBeenCalledWith('cart');
});

it('does not open the drawer when adding fails', async () => {
  addToCart.mockRejectedValueOnce(new Error('nope'));
  render(<SelectionBar />);
  await userEvent.click(screen.getByText('Add 2 to cart'));
  expect(openDrawer).not.toHaveBeenCalled();
});
```

`FileBrowserCartItem.test.tsx`: rename every `'Add to Neuroglancer cart'` to `'Add to cart'`, `'Added "subfolder" to the Neuroglancer cart'` to `'Added "subfolder" to the cart'`, and the error string to `'Error adding "subfolder" to the cart: preference update failed'`. Add a `react-router` partial mock exposing `useOutletContext: () => ({ openDrawer })` (keep `useNavigate` and anything else the file already relies on via `importOriginal`) and assert `openDrawer` was called with `'cart'` in the success test. Add:

```ts
it('no longer offers "View in Neuroglancer"', async () => {
  renderBrowserWithFolder(); // the file's existing helper that opens the context menu
  expect(screen.queryByText('View in Neuroglancer')).not.toBeInTheDocument();
});
```

Delete `FileBrowserViewInNg.test.tsx`.

- [ ] **Step 2: Run to confirm failure**

Run: `pixi run test-frontend -- "SelectionBar|FileBrowserCartItem"`
Expected: FAIL on `openDrawer` and on the renamed strings.

- [ ] **Step 3: Add `openDrawer` to the layout hook and outlet context**

`useLayoutPrefs.ts`, after `selectDrawerMode`:

```ts
  // Non-toggling: used by "add to cart" so the cart becomes visible even if
  // it was already the selected mode.
  const openDrawer = (mode: 'properties' | 'cart') => {
    setPropertiesDrawerMode(mode);
    setShowPropertiesDrawer(true);
  };
```

Add `openDrawer` to the returned object.

`BrowseLayout.tsx`: add `openDrawer: (mode: 'properties' | 'cart') => void;` to `OutletContextType`, destructure it from `useLayoutPrefs()`, and add `openDrawer: openDrawer` to `outletContextValue`.

- [ ] **Step 4: Call it from the selection bar**

`SelectionBar.tsx`:

```ts
import { useOutletContext } from 'react-router';
import type { OutletContextType } from '@/layouts/BrowseLayout';
...
  // ponytail: optional — component tests render without a router outlet.
  const outlet = useOutletContext<OutletContextType | undefined>();
...
  const handleAddToCart = async () => {
    try {
      await addToCart(selectionDatasets);
      toast.success(`Added ${checkedFiles.length} items to the cart`);
      outlet?.openDrawer('cart');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error(`Error adding items to the cart: ${errorMessage}`);
    }
  };
```

- [ ] **Step 5: Update the file-browser context menu**

`FileBrowser.tsx`:

1. Remove `import { useCreateViewFlow } from '@/hooks/useCreateViewFlow';`, the line `const { startCreateView, dialog } = useCreateViewFlow();`, and `{dialog}` near line 398. If `navigate` is now unused, remove `useNavigate` too (check with eslint).
2. Add `useOutletContext` to the `react-router` import and `import type { OutletContextType } from '@/layouts/BrowseLayout';`; add `const outlet = useOutletContext<OutletContextType | undefined>();` next to the other hooks.
3. Rename the menu item and toasts:

```ts
      {
        name: 'Add to cart',
        action: async () => {
          const file = fileBrowserState.selectedFiles[0];
          if (!file) {
            return;
          }
          try {
            await addToCart([
              {
                fsp_name: fileQuery.data?.currentFileSharePath?.name ?? '',
                path: file.path,
                label: file.name
              }
            ]);
            toast.success(`Added "${file.name}" to the cart`);
            outlet?.openDrawer('cart');
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            toast.error(
              `Error adding "${file.name}" to the cart: ${errorMessage}`
            );
          }
        },
        shouldShow:
          fileBrowserState.selectedFiles[0]?.is_dir &&
          !fileBrowserState.selectedFiles[0]?.is_symlink
      },
```

4. Delete the whole `{ name: 'View in Neuroglancer', ... }` menu item object.

- [ ] **Step 6: Run tests, type check, lint**

Run: `pixi run test-frontend -- "SelectionBar|FileBrowserCartItem|FileBrowser" && pixi run node-check && pixi run node-prettier-write && pixi run node-eslint-check`
Expected: PASS; no unused imports.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/useLayoutPrefs.ts frontend/src/layouts/BrowseLayout.tsx frontend/src/components/ui/BrowsePage/SelectionBar.tsx frontend/src/components/ui/BrowsePage/FileBrowser.tsx frontend/src/__tests__/componentTests/SelectionBar.test.tsx frontend/src/__tests__/componentTests/FileBrowserCartItem.test.tsx
git rm frontend/src/__tests__/componentTests/FileBrowserViewInNg.test.tsx
git commit -m "feat(views): open the cart drawer on add; drop View in Neuroglancer from the row menu

Row menu item is now 'Add to cart'. Both add paths call the new
non-toggling openDrawer('cart') from the browse layout outlet context."
```

---

### Task 4: `probeDataset` shared by checkout and the cart

**Files:**
- Modify: `frontend/src/utils/viewCheckout.ts:33-68`
- Modify: `frontend/src/hooks/useCartDimensionCheck.ts`
- Test: `frontend/src/__tests__/unitTests/viewCheckout.test.ts` (create if absent; check `frontend/src/__tests__/unitTests/` for an existing `viewCheckout` or `buildViewState` test and extend it instead)

**Interfaces:**
- Produces:
  ```ts
  export type DatasetKind = 'ome' | 'array' | 'unsupported';
  export type DatasetProbe =
    | { kind: 'ome'; metadata: Metadata }
    | { kind: 'array' }
    | { kind: 'unsupported' };
  export async function probeDataset(url: string): Promise<DatasetProbe>;
  ```
  from `@/utils/viewCheckout`, and `useCartDimensionCheck(items)` now returns `{ mismatchedKeys, hasMismatch, kindByKey: Map<string, DatasetKind | 'loading'> }`.

- [ ] **Step 1: Write the failing unit test**

```ts
import { describe, it, expect, vi } from 'vitest';

const getOmeZarrMetadata = vi.fn();
const generateStateForPlainZarr = vi.fn();
vi.mock('@/omezarr-helper', () => ({
  getOmeZarrMetadata,
  generateStateForPlainZarr,
  generateNeuroglancerStateForOmeZarr: vi.fn(),
  generateNeuroglancerStateForDataURL: vi.fn()
}));

import { probeDataset } from '@/utils/viewCheckout';

describe('probeDataset', () => {
  it('reports ome when OME metadata loads', async () => {
    const metadata = { multiscales: [{}], zarrVersion: 3 };
    getOmeZarrMetadata.mockResolvedValueOnce(metadata);
    expect(await probeDataset('u')).toEqual({ kind: 'ome', metadata });
  });
  it('falls back to array when only a plain Zarr array loads', async () => {
    getOmeZarrMetadata.mockRejectedValueOnce(new Error('no ome'));
    generateStateForPlainZarr.mockResolvedValueOnce('%7B%7D');
    expect(await probeDataset('u')).toEqual({ kind: 'array' });
  });
  it('reports unsupported when neither loads', async () => {
    getOmeZarrMetadata.mockRejectedValueOnce(new Error('no ome'));
    generateStateForPlainZarr.mockRejectedValueOnce(new Error('no array'));
    expect(await probeDataset('u')).toEqual({ kind: 'unsupported' });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pixi run test-frontend -- viewCheckout`
Expected: FAIL (`probeDataset` is not exported).

- [ ] **Step 3: Implement `probeDataset` and use it in checkout**

In `viewCheckout.ts`, add after the imports:

```ts
import type { Metadata } from '@/omezarr-helper';

export type DatasetKind = 'ome' | 'array' | 'unsupported';
export type DatasetProbe =
  | { kind: 'ome'; metadata: Metadata }
  | { kind: 'array' }
  | { kind: 'unsupported' };

// Single source of truth for "what will this dataset become in Neuroglancer":
// the cart indicator and checkout both call this, so they cannot disagree.
export async function probeDataset(url: string): Promise<DatasetProbe> {
  try {
    return { kind: 'ome', metadata: await getOmeZarrMetadata(url) };
  } catch {
    try {
      await generateStateForPlainZarr(url);
      return { kind: 'array' };
    } catch {
      return { kind: 'unsupported' };
    }
  }
}
```

Rewrite `generateStateForDataset` to use it:

```ts
async function generateStateForDataset(
  ds: ResolvedCheckoutDataset
): Promise<NgState | null> {
  const probe = await probeDataset(ds.url);
  if (probe.kind === 'unsupported') {
    log.error(`Not a Zarr dataset, skipping cart entry: ${ds.url}`);
    return null;
  }
  if (probe.kind === 'array') {
    return decodeState(await generateStateForPlainZarr(ds.url));
  }
  const { metadata } = probe;
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
        metadata.omero,
        ds.channel !== undefined
      )
    : generateNeuroglancerStateForDataURL(ds.url, metadata.zarrVersion);
  return decodeState(encoded);
}
```

(The `array` branch calls `generateStateForPlainZarr` a second time; it is cheap and keeps `probeDataset` side-effect free. Acceptable.)

- [ ] **Step 4: Make the cart hook use the probe and expose `kindByKey`**

Rewrite `useCartDimensionCheck.ts`:

```ts
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { datasetKey, getFileURL } from '@/utils/pathHandling';
import { probeDataset } from '@/utils/viewCheckout';
import type { DatasetKind, DatasetProbe } from '@/utils/viewCheckout';
import {
  getDimensionSignature,
  signaturesMatch
} from '@/utils/dimensionSignature';
import type { CartItem } from '@/contexts/CartContext';

export type CartDimensionCheck = {
  mismatchedKeys: Set<string>;
  hasMismatch: boolean;
  kindByKey: Map<string, DatasetKind | 'loading'>;
};

// One entry per unique dataset, preserving first-added order (order[0] is the
// reference dataset for the mismatch comparison).
function uniqueDatasets(items: CartItem[]) {
  const seen = new Set<string>();
  const out: { key: string; fsp_name: string; path: string }[] = [];
  for (const item of items) {
    const key = datasetKey(item.fsp_name, item.path);
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ key, fsp_name: item.fsp_name, path: item.path });
    }
  }
  return out;
}

export function useCartDimensionCheck(items: CartItem[]): CartDimensionCheck {
  const datasets = useMemo(() => uniqueDatasets(items), [items]);

  const results = useQueries({
    queries: datasets.map(ds => ({
      queryKey: ['zarr', 'probe', ds.fsp_name, ds.path],
      queryFn: (): Promise<DatasetProbe> =>
        probeDataset(getFileURL(ds.fsp_name, ds.path)),
      staleTime: 5 * 60 * 1000,
      retry: false
    }))
  });

  // useQueries returns fresh array refs each render; key the memo on which
  // datasets have resolved so it recomputes as probes land.
  const resolvedKey = results.map(r => r.data?.kind ?? '-').join(',');

  return useMemo(() => {
    const kindByKey = new Map<string, DatasetKind | 'loading'>();
    const signatures = datasets.map((ds, i) => {
      const probe = results[i]?.data;
      kindByKey.set(ds.key, probe?.kind ?? 'loading');
      // Fail open: only OME datasets have a signature; null never warns.
      return probe?.kind === 'ome' ? getDimensionSignature(probe.metadata) : null;
    });

    const reference = signatures[0];
    const mismatchedKeys = new Set<string>();
    if (reference) {
      for (let i = 1; i < datasets.length; i++) {
        const sig = signatures[i];
        if (sig && !signaturesMatch(reference, sig)) {
          mismatchedKeys.add(datasets[i].key);
        }
      }
    }
    return { mismatchedKeys, hasMismatch: mismatchedKeys.size > 0, kindByKey };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets, resolvedKey]);
}
```

Existing tests mock `getOmeZarrMetadata` directly for this hook (`CartList.test.tsx`, `CartTab.test.tsx`, `CreateViewButton.test.tsx`, `useCreateViewFlow.test.tsx`). Where they mock `@/hooks/useCartDimensionCheck` wholesale, add `kindByKey: new Map()` to the mocked return. Where they mock `@/omezarr-helper`, also provide `generateStateForPlainZarr: vi.fn().mockRejectedValue(new Error('not an array'))` so non-OME fixtures resolve to `unsupported` instead of hanging.

- [ ] **Step 5: Run the affected tests and type check**

Run: `pixi run test-frontend -- "viewCheckout|CartList|CartTab|CreateViewButton|useCreateViewFlow" && pixi run node-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/viewCheckout.ts frontend/src/hooks/useCartDimensionCheck.ts frontend/src/__tests__
git commit -m "refactor(views): share probeDataset between checkout and the cart dimension check

The cart hook now reports each dataset's kind (ome/array/unsupported) from
the same classification checkout uses."
```

---

### Task 5: Layer-status indicator on each cart row

**Files:**
- Modify: `frontend/src/components/ui/Views/CartDatasetRow.tsx`
- Modify: `frontend/src/components/ui/Views/CartList.tsx:52, 73-80`
- Test: `frontend/src/__tests__/componentTests/CartList.test.tsx`

**Interfaces:**
- Consumes: `kindByKey` from Task 4.
- Produces: `CartDatasetRow` prop `kind: DatasetKind | 'loading'`.

- [ ] **Step 1: Write the failing tests**

In `CartList.test.tsx`, where `useCartDimensionCheck` is mocked, make the mock return a `kindByKey` and add:

```ts
it('marks datasets that will and will not load as Neuroglancer layers', () => {
  mockDimensionCheck({
    mismatchedKeys: new Set(),
    hasMismatch: false,
    kindByKey: new Map([
      [datasetKey('f', '/ok.zarr'), 'ome'],
      [datasetKey('f', '/plain.zarr'), 'array'],
      [datasetKey('f', '/nope'), 'unsupported']
    ])
  });
  renderCart([
    { fsp_name: 'f', path: '/ok.zarr', label: 'ok' },
    { fsp_name: 'f', path: '/plain.zarr', label: 'plain' },
    { fsp_name: 'f', path: '/nope', label: 'nope' }
  ]);
  expect(screen.getAllByLabelText('Will load as a Neuroglancer layer')).toHaveLength(2);
  expect(screen.getByLabelText("Not a Zarr dataset. It won't appear as a layer in Neuroglancer.")).toBeInTheDocument();
});
```

(`mockDimensionCheck` / `renderCart` stand for the file's existing helpers; adapt names.)

- [ ] **Step 2: Run to confirm failure**

Run: `pixi run test-frontend -- CartList`
Expected: FAIL (labels not found).

- [ ] **Step 3: Render the indicator**

`CartDatasetRow.tsx`:

```ts
import { HiOutlineCheckCircle, HiOutlineXCircle } from 'react-icons/hi';
import type { DatasetKind } from '@/utils/viewCheckout';
...
interface CartDatasetRowProps {
  readonly fsp_name: string;
  readonly path: string;
  readonly label: string;
  readonly items: CartItem[];
  readonly mismatch?: boolean;
  readonly kind: DatasetKind | 'loading';
}

const LAYER_STATUS = {
  ome: { icon: HiOutlineCheckCircle, className: 'text-success', label: 'Will load as a Neuroglancer layer' },
  array: { icon: HiOutlineCheckCircle, className: 'text-success', label: 'Will load as a Neuroglancer layer' },
  unsupported: { icon: HiOutlineXCircle, className: 'text-error', label: "Not a Zarr dataset. It won't appear as a layer in Neuroglancer." }
} as const;
```

Inside the header `<button>`, directly after the `<Typography>{label}</Typography>` and before the mismatch icon:

```tsx
          {kind !== 'loading' ? (
            <FgTooltip label={LAYER_STATUS[kind].label}>
              <span aria-label={LAYER_STATUS[kind].label} role="img">
                <FgIcon
                  className={`${LAYER_STATUS[kind].className} shrink-0`}
                  icon={LAYER_STATUS[kind].icon}
                  size="sm"
                />
              </span>
            </FgTooltip>
          ) : null}
```

`CartList.tsx`: destructure `kindByKey` from `useCartDimensionCheck(cart)` and pass `kind={kindByKey.get(datasetKey(group.fsp_name, group.path)) ?? 'loading'}` to each `CartDatasetRow`.

- [ ] **Step 4: Run tests, type check, lint**

Run: `pixi run test-frontend -- "CartList|CartTab|CartDatasetRow" && pixi run node-check && pixi run node-prettier-write && pixi run node-eslint-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/Views/CartDatasetRow.tsx frontend/src/components/ui/Views/CartList.tsx frontend/src/__tests__/componentTests/CartList.test.tsx
git commit -m "feat(views): show whether each cart dataset will load as a Neuroglancer layer"
```

---

### Task 6: Focus and select the name in the Create View dialog

**Files:**
- Modify: `frontend/src/hooks/useCreateViewFlow.tsx:108-113`
- Test: `frontend/src/__tests__/componentTests/useCreateViewFlow.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it('focuses and selects the default name so typing replaces it', async () => {
  openDialog('New View'); // the file's existing helper that calls startCreateView
  const input = await screen.findByLabelText('View name');
  expect(input).toHaveFocus();
  expect((input as HTMLInputElement).selectionStart).toBe(0);
  expect((input as HTMLInputElement).selectionEnd).toBe('New View'.length);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pixi run test-frontend -- useCreateViewFlow`
Expected: FAIL (`toHaveFocus`).

- [ ] **Step 3: Implement**

```tsx
        <FgInput
          aria-label="View name"
          autoFocus
          onChange={e => setName(e.target.value)}
          onFocus={e => e.target.select()}
          value={name}
        />
```

- [ ] **Step 4: Run tests**

Run: `pixi run test-frontend -- useCreateViewFlow`
Expected: PASS. Then check in the running app (`pixi run dev-launch` + `pixi run dev-watch`) that focus lands in the field when the dialog opens from the cart. If the Material Tailwind dialog steals focus, replace `autoFocus` with a `useRef<HTMLInputElement>` plus `useEffect(() => { if (request) { inputRef.current?.focus(); inputRef.current?.select(); } }, [request])`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useCreateViewFlow.tsx frontend/src/__tests__/componentTests/useCreateViewFlow.test.tsx
git commit -m "feat(views): focus and select the name when the Create View dialog opens"
```

---

### Task 7: Full-suite verification and PR

- [ ] **Step 1: Run everything**

```bash
pixi run test-frontend
pixi run node-check
pixi run node-prettier-check
pixi run node-eslint-check
pixi run test-ui
```
Expected: frontend suite green; node-check at the known baseline; prettier/eslint clean; Playwright green (no UI test references "View in Neuroglancer" or "New View from selection"; grep `frontend/ui-tests/tests` to confirm).

- [ ] **Step 2: Push and open the stacked draft PR**

Base: `ngviews-08-broken-source-tracking`. Title: `feat(views): cart shows layer status; cart is the only path to a View`. Body lists items 5, 6, 7, 8, 9, 11.
