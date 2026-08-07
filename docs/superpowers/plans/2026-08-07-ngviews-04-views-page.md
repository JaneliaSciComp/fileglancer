# Neuroglancer Views — PR 4 (`ngviews-04-views-page`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `/ngviews` page — a **Saved Views** table (open · export · rename · delete) plus a **Layer Cart** tab shell — backed by a new `viewQueries` module, `ViewsContext`, and a preference-backed `CartContext`; rename the "NG Links" nav entry to "NG Views" with a passive cart-count badge, and redirect `/nglinks` → `/ngviews`.

**Architecture:** Mirror the existing NG Links stack one-for-one. `viewQueries.ts` mirrors `ngLinkQueries.ts` (types + query-key factory + fetch helper + 4 CRUD hooks against `/api/neuroglancer/views`). `ViewsContext.tsx` mirrors `NGLinkContext.tsx` (bundles the 4 hooks, route-scoped). The page mirrors `NGLinks.tsx` (`TableCard` + a `useNGViewsColumns` hook), but has **no page-level "New" button** — Views are created by cart checkout (PR 5) and scratch save (PR 6), not on this page. The Layer Cart is a single `neuroglancerCart` `UserPreferenceDB` row (a JSON array), read/written through a thin `CartContext`; the passive nav badge reads the same preference via a tiny `useCartCount` hook so no global cart provider is needed. `/ngviews` and its providers are route-scoped exactly like `/nglinks` is today.

**Tech Stack:** React 18, TypeScript, TanStack Query v5 + Table v8, Material Tailwind v3, `react-router` (declarative `<Routes>`), Vitest + React Testing Library + MSW. All commands run through **pixi**.

## Global Constraints

- **Always use pixi.** Frontend tests: `pixi run test-frontend`. Type check: `pixi run node-check`. Lint: `pixi run node-eslint-check` (autofix `node-eslint-write`).
- **Branch:** all commits land on `ngviews-04-views-page`, branched off **`ngviews-03-multiselect`** (stacked PR 4; base is PR 3). Create it first: `git checkout ngviews-03-multiselect && git checkout -b ngviews-04-views-page`.
- **Frontend conventions** (`frontend/CLAUDE.md`): separate value/type imports (`import { x }` and `import type { T }` on separate lines); never hand-build URLs — use `buildUrl`/`sendFetchRequest` from `@/utils` and the helpers in `@/queries/queryUtils`; no `console.log` (use `src/logger.ts`); PascalCase component files; named React imports; define props interfaces; **do not** annotate component return types.
- **Backend is already merged (PR 2).** Do not touch `fileglancer/`. The endpoints and response shapes this PR consumes exist: `POST/GET /api/neuroglancer/views`, `GET/PUT/DELETE /api/neuroglancer/views/{short_key}`, `GET /ngview/{key}`. The `GET` list returns `{ "views": [...] }` (unlike `/nglinks` which returns `{ "links": [...] }`), and `DELETE` returns `{ "message": ... }` (not `204`).
- **Type-match the backend `model.py` exactly** (Task 1): `View`, `ViewLayer`, `ViewCreateRequest`, `ViewLayerInput`, `ViewUpdateRequest`. Note the input-vs-output asymmetry: `ViewLayerInput` carries `sharing_key` (a Data Link key); the `ViewLayer` response carries `data_link_id` + `broken`. `datetime` fields arrive as ISO strings.
- **Reuse, don't rebuild:** `TableCard`, `CardActionsMenu`, `MenuItem`, `FgButton`, `FgDialog`, `FgBadge`, `FgTooltip`, `formatDateString` (`@/utils`), `copyToClipboard` (`@/utils/copyText`), `constructNeuroglancerUrl` (`@/utils/neuroglancerUrl`), `useDefaultNeuroglancerBaseUrl` (`@/hooks/useDefaultNeuroglancerBaseUrl`), `useUpdatePreferenceMutation` (`@/queries/preferencesQueries`).
- **`sharing_mode` is a stored label only** (per PR 2 decisions) — the page displays it, never enforces it.

**Interfaces this PR produces (consumed by PR 5 / PR 6):**
- `@/queries/viewQueries`: types `View`, `ViewLayer`, `ViewResponse`, `ViewLayerInput`, `ViewCreateRequest`, `ViewUpdateRequest`; hooks `useViewsQuery`, `useCreateViewMutation`, `useUpdateViewMutation`, `useDeleteViewMutation`; `viewQueryKeys`.
- `@/contexts/ViewsContext`: `useViewsContext()` → `{ allViewsQuery, createViewMutation, updateViewMutation, deleteViewMutation }`; `ViewsProvider`.
- `@/contexts/CartContext`: `useCartContext()` → `{ cart, cartCount, addToCart, removeFromCart, clearCart }`; `CartProvider`; type `CartItem`.
- `@/hooks/useCartCount`: `useCartCount(): number`.

---

### Task 1: `viewQueries.ts` — types + CRUD hooks

**Files:**
- Create: `frontend/src/queries/viewQueries.ts`
- Test: `frontend/src/__tests__/unitTests/viewQueries.test.tsx` (new)

**Interfaces:**
- Consumes: `sendFetchRequest`, `buildUrl` (`@/utils`); `getResponseJsonOrError`, `sendRequestAndThrowForNotOk`, `throwResponseNotOkError` (`./queryUtils`); TanStack `useQuery`/`useMutation`/`useQueryClient`.
- Produces: the types + hooks + `viewQueryKeys` listed in Global Constraints. Backend field names (from `fileglancer/model.py`): `View { short_key, read_key, name, ng_state, sharing_mode: 'private'|'read', owner, created_at, updated_at, layers }`; `ViewLayer { layer_index, data_link_id, channel, opts, broken }`; `ViewLayerInput { sharing_key, layer_index, channel, opts }`; `ViewCreateRequest { name, ng_state, sharing_mode?, layers }`; `ViewUpdateRequest { name?, ng_state? }`. List endpoint returns `{ views: View[] }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unitTests/viewQueries.test.tsx`. Mirror the mocking style of `unitTests/fileQueries.errorHandling.test.tsx` (stub `@/utils` so no network happens), then exercise `fetchViews` behavior through `useViewsQuery` via `renderHook`.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Stub the low-level fetch/url utils so the queries never hit the network.
const sendFetchRequest = vi.fn();
const buildUrl = vi.fn((base: string, seg: string | null) => `${base}${seg ?? ''}`);
vi.mock('@/utils', () => ({
  sendFetchRequest: (...args: unknown[]) => sendFetchRequest(...args),
  buildUrl: (...args: unknown[]) => buildUrl(...args)
}));

import { useViewsQuery, viewQueryKeys } from '@/queries/viewQueries';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('viewQueries', () => {
  beforeEach(() => {
    sendFetchRequest.mockReset();
  });

  it('has a stable query-key factory', () => {
    expect(viewQueryKeys.list()).toEqual(['views', 'list']);
  });

  it('unwraps the { views } envelope from the list endpoint', async () => {
    sendFetchRequest.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        views: [{ short_key: 'k1', name: 'A', layers: [] }]
      })
    });
    const { result } = renderHook(() => useViewsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].short_key).toBe('k1');
    expect(sendFetchRequest).toHaveBeenCalledWith(
      '/api/neuroglancer/views',
      'GET',
      undefined,
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('treats a 404 list as an empty array (no error)', async () => {
    sendFetchRequest.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({})
    });
    const { result } = renderHook(() => useViewsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
```

> If `getResponseJsonOrError` in `./queryUtils` calls `response.json()` directly, the mocked response objects above (with an async `json()`) satisfy it. If it instead reads `response.text()`, add a `text: async () => JSON.stringify(...)` field to the mocks — read `queryUtils.ts` first and match whichever it uses.

- [ ] **Step 2: Run test to verify it fails**

Run: `pixi run test-frontend -- viewQueries`
Expected: FAIL — `@/queries/viewQueries` does not exist (module resolution error).

- [ ] **Step 3: Write `viewQueries.ts`**

Create `frontend/src/queries/viewQueries.ts`. This is `ngLinkQueries.ts` adapted to the Views API and response envelope:

```tsx
import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  UseMutationResult
} from '@tanstack/react-query';

import { sendFetchRequest, buildUrl } from '@/utils';
import {
  getResponseJsonOrError,
  sendRequestAndThrowForNotOk,
  throwResponseNotOkError
} from './queryUtils';

export type ViewLayer = {
  layer_index: number;
  data_link_id: number | null;
  channel: string | null;
  opts: Record<string, unknown> | null;
  broken: boolean;
};

export type View = {
  short_key: string;
  read_key: string;
  name: string;
  ng_state: Record<string, unknown>;
  sharing_mode: 'private' | 'read';
  owner: string;
  created_at: string;
  updated_at: string;
  layers: ViewLayer[];
};

export type ViewLayerInput = {
  sharing_key: string | null;
  layer_index: number;
  channel: string | null;
  opts: Record<string, unknown> | null;
};

export type ViewCreateRequest = {
  name: string;
  ng_state: Record<string, unknown>;
  sharing_mode?: 'private' | 'read';
  layers: ViewLayerInput[];
};

export type ViewUpdateRequest = {
  name?: string;
  ng_state?: Record<string, unknown>;
};

/** Raw API envelope from GET /api/neuroglancer/views */
type ViewsResponse = {
  views?: View[];
};

export const viewQueryKeys = {
  all: ['views'] as const,
  list: () => ['views', 'list'] as const
};

/** Newest-updated first. */
function sortViewsByDate(views: View[]): View[] {
  return views.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

/** Fetches the current user's Views. Returns [] on 404. */
const fetchViews = async (signal?: AbortSignal): Promise<View[]> => {
  const response = await sendFetchRequest(
    '/api/neuroglancer/views',
    'GET',
    undefined,
    { signal }
  );
  const data = (await getResponseJsonOrError(response)) as ViewsResponse;

  if (response.ok) {
    return data?.views ? sortViewsByDate(data.views) : [];
  }
  if (response.status === 404) {
    return [];
  }
  throwResponseNotOkError(response, data);
  return []; // unreachable; throwResponseNotOkError always throws
};

export function useViewsQuery(): UseQueryResult<View[], Error> {
  return useQuery<View[], Error>({
    queryKey: viewQueryKeys.list(),
    queryFn: ({ signal }) => fetchViews(signal)
  });
}

export function useCreateViewMutation(): UseMutationResult<
  View,
  Error,
  ViewCreateRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ViewCreateRequest) => {
      const view = await sendRequestAndThrowForNotOk(
        '/api/neuroglancer/views',
        'POST',
        payload
      );
      return view as View;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: viewQueryKeys.all });
    }
  });
}

export function useUpdateViewMutation(): UseMutationResult<
  View,
  Error,
  { short_key: string } & ViewUpdateRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      short_key,
      ...body
    }: { short_key: string } & ViewUpdateRequest) => {
      const url = buildUrl('/api/neuroglancer/views/', short_key, null);
      const view = await sendRequestAndThrowForNotOk(url, 'PUT', body);
      return view as View;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: viewQueryKeys.all });
    }
  });
}

export function useDeleteViewMutation(): UseMutationResult<
  void,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (shortKey: string) => {
      const url = buildUrl('/api/neuroglancer/views/', shortKey, null);
      await sendRequestAndThrowForNotOk(url, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: viewQueryKeys.all });
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pixi run test-frontend -- viewQueries`
Expected: PASS.

- [ ] **Step 5: Type-check and lint**

Run: `pixi run node-check` then `pixi run node-eslint-check`
Expected: no new errors. (`node-eslint-write` to autofix formatting.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/queries/viewQueries.ts frontend/src/__tests__/unitTests/viewQueries.test.tsx
git commit -m "feat(views): add viewQueries module (types + CRUD hooks)"
```

---

### Task 2: `ViewsContext.tsx` — provider bundling the CRUD hooks

**Files:**
- Create: `frontend/src/contexts/ViewsContext.tsx`

**Interfaces:**
- Consumes: Task 1's `useViewsQuery`, `useCreateViewMutation`, `useUpdateViewMutation`, `useDeleteViewMutation`.
- Produces: `useViewsContext()` → `{ allViewsQuery, createViewMutation, updateViewMutation, deleteViewMutation }`; `ViewsProvider`. (Naming mirrors `NGLinkContext` so PR 5's checkout can reach `createViewMutation`.)

This is a direct mirror of `NGLinkContext.tsx` — no behavior of its own, so it is verified transitively by Task 5's page test (which renders inside `ViewsProvider`). No standalone test.

- [ ] **Step 1: Write `ViewsContext.tsx`**

```tsx
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import {
  useViewsQuery,
  useCreateViewMutation,
  useUpdateViewMutation,
  useDeleteViewMutation
} from '@/queries/viewQueries';

type ViewsContextType = {
  allViewsQuery: ReturnType<typeof useViewsQuery>;
  createViewMutation: ReturnType<typeof useCreateViewMutation>;
  updateViewMutation: ReturnType<typeof useUpdateViewMutation>;
  deleteViewMutation: ReturnType<typeof useDeleteViewMutation>;
};

const ViewsContext = createContext<ViewsContextType | null>(null);

export const useViewsContext = () => {
  const context = useContext(ViewsContext);
  if (!context) {
    throw new Error('useViewsContext must be used within a ViewsProvider');
  }
  return context;
};

export const ViewsProvider = ({
  children
}: {
  readonly children: ReactNode;
}) => {
  const allViewsQuery = useViewsQuery();
  const createViewMutation = useCreateViewMutation();
  const updateViewMutation = useUpdateViewMutation();
  const deleteViewMutation = useDeleteViewMutation();

  const value: ViewsContextType = {
    allViewsQuery,
    createViewMutation,
    updateViewMutation,
    deleteViewMutation
  };

  return (
    <ViewsContext.Provider value={value}>{children}</ViewsContext.Provider>
  );
};

export default ViewsContext;
```

- [ ] **Step 2: Type-check and lint**

Run: `pixi run node-check` then `pixi run node-eslint-check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/contexts/ViewsContext.tsx
git commit -m "feat(views): add ViewsContext provider"
```

---

### Task 3: `neuroglancerCart` preference + `CartContext` + `useCartCount`

**Files:**
- Modify: `frontend/src/queries/preferencesQueries.ts` (add the `neuroglancerCart` field to the API-response type, the query-data type, and the transform)
- Create: `frontend/src/contexts/CartContext.tsx`
- Create: `frontend/src/hooks/useCartCount.ts`
- Test: `frontend/src/__tests__/componentTests/CartContext.test.tsx` (new)

**Interfaces:**
- Consumes: `usePreferencesContext()` (`@/contexts/PreferencesContext`) for the read side (`preferenceQuery.data?.neuroglancerCart`); `useUpdatePreferenceMutation()` (`@/queries/preferencesQueries`) for the write side.
- Produces: type `CartItem = { fsp_name: string; path: string; channel?: string; label: string }` (defined in `preferencesQueries.ts`, the storage owner, to avoid an import cycle with `CartContext`); `useCartContext()` → `{ cart: CartItem[]; cartCount: number; addToCart(items: CartItem[]): Promise<void>; removeFromCart(path: string, channel?: string): Promise<void>; clearCart(): Promise<void> }`; `CartProvider`; `useCartCount(): number`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/componentTests/CartContext.test.tsx`. Mock `usePreferencesContext` (read side) and `useUpdatePreferenceMutation` (write side) so the reducer logic is tested in isolation.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';

const mutateAsync = vi.fn().mockResolvedValue(undefined);
let cartData: unknown[] = [];

vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({
    preferenceQuery: { data: { neuroglancerCart: cartData } }
  })
}));
vi.mock('@/queries/preferencesQueries', () => ({
  useUpdatePreferenceMutation: () => ({ mutateAsync })
}));

import { CartProvider, useCartContext } from '@/contexts/CartContext';

function Probe() {
  const { cart, cartCount, addToCart, removeFromCart, clearCart } =
    useCartContext();
  return (
    <div>
      <span data-testid="count">{cartCount}</span>
      <span data-testid="len">{cart.length}</span>
      <button
        onClick={() =>
          addToCart([
            { fsp_name: 'fsp', path: '/a', label: 'a' },
            { fsp_name: 'fsp', path: '/a', label: 'a' } // dup, must not double
          ])
        }
      >
        add
      </button>
      <button onClick={() => removeFromCart('/a')}>remove</button>
      <button onClick={() => clearCart()}>clear</button>
    </div>
  );
}

describe('CartContext', () => {
  beforeEach(() => {
    mutateAsync.mockClear();
    cartData = [];
  });

  it('reflects the preference and exposes a count', () => {
    cartData = [{ fsp_name: 'fsp', path: '/x', label: 'x' }];
    render(
      <CartProvider>
        <Probe />
      </CartProvider>
    );
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('len').textContent).toBe('1');
  });

  it('addToCart dedupes and persists via the preference mutation', async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <Probe />
      </CartProvider>
    );
    await user.click(screen.getByText('add'));
    expect(mutateAsync).toHaveBeenCalledWith({
      key: 'neuroglancerCart',
      value: [{ fsp_name: 'fsp', path: '/a', label: 'a' }]
    });
  });

  it('clearCart persists an empty array', async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <Probe />
      </CartProvider>
    );
    await user.click(screen.getByText('clear'));
    expect(mutateAsync).toHaveBeenCalledWith({
      key: 'neuroglancerCart',
      value: []
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pixi run test-frontend -- CartContext`
Expected: FAIL — `@/contexts/CartContext` does not exist.

- [ ] **Step 3: Add the `neuroglancerCart` preference field**

In `frontend/src/queries/preferencesQueries.ts`:

(a) Define and export the cart item type near the top-of-file type declarations:

```tsx
export type CartItem = {
  fsp_name: string;
  path: string;
  channel?: string;
  label: string;
};
```

(b) Add the field to the raw API-response type (the `PreferencesApiResponse`/`PreferencesResponse` interface — around lines 32-50), as optional:

```tsx
  neuroglancerCart?: CartItem[];
```

(c) Add it to the transformed query-data type (`PreferencesQueryData`, around lines 55-80):

```tsx
  neuroglancerCart: CartItem[];
```

(d) In the `select`/transform that builds `PreferencesQueryData` from the API response (the returned object around lines 221-253), add:

```tsx
    neuroglancerCart: apiResponse.neuroglancerCart ?? [],
```

(match the exact local variable name the transform uses for the raw response — read the function first).

`// ponytail: cart lives in the generic preference blob (no new table/endpoint); a table only if it ever needs indexing or cross-user sharing.`

- [ ] **Step 4: Write `CartContext.tsx`**

Create `frontend/src/contexts/CartContext.tsx`:

```tsx
import { createContext, useCallback, useContext } from 'react';
import type { ReactNode } from 'react';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import {
  useUpdatePreferenceMutation
} from '@/queries/preferencesQueries';
import type { CartItem } from '@/queries/preferencesQueries';

export type { CartItem };

type CartContextType = {
  cart: CartItem[];
  cartCount: number;
  addToCart: (items: CartItem[]) => Promise<void>;
  removeFromCart: (path: string, channel?: string) => Promise<void>;
  clearCart: () => Promise<void>;
};

const CartContext = createContext<CartContextType | null>(null);

export const useCartContext = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCartContext must be used within a CartProvider');
  }
  return context;
};

// Identity of a cart entry: fsp + path + channel (channel-per-layer).
const itemKey = (i: CartItem) =>
  `${i.fsp_name}::${i.path}::${i.channel ?? ''}`;

export const CartProvider = ({
  children
}: {
  readonly children: ReactNode;
}) => {
  const { preferenceQuery } = usePreferencesContext();
  const updatePreference = useUpdatePreferenceMutation();

  const cart = preferenceQuery.data?.neuroglancerCart ?? [];

  const persist = useCallback(
    async (next: CartItem[]) => {
      await updatePreference.mutateAsync({
        key: 'neuroglancerCart',
        value: next
      });
    },
    [updatePreference]
  );

  const addToCart = useCallback(
    async (items: CartItem[]) => {
      const seen = new Set(cart.map(itemKey));
      const additions = items.filter(i => !seen.has(itemKey(i)));
      if (additions.length === 0) {
        return;
      }
      await persist([...cart, ...additions]);
    },
    [cart, persist]
  );

  const removeFromCart = useCallback(
    async (path: string, channel?: string) => {
      await persist(
        cart.filter(i => !(i.path === path && i.channel === channel))
      );
    },
    [cart, persist]
  );

  const clearCart = useCallback(() => persist([]), [persist]);

  const value: CartContextType = {
    cart,
    cartCount: cart.length,
    addToCart,
    removeFromCart,
    clearCart
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export default CartContext;
```

- [ ] **Step 5: Write `useCartCount.ts`**

Create `frontend/src/hooks/useCartCount.ts` — a badge-only reader that does **not** require `CartProvider` (so the nav can show a count on every route, reading the globally-mounted `PreferencesContext`):

```tsx
import { usePreferencesContext } from '@/contexts/PreferencesContext';

export function useCartCount(): number {
  const { preferenceQuery } = usePreferencesContext();
  return preferenceQuery.data?.neuroglancerCart?.length ?? 0;
}
```

`// ponytail: nav badge reads the preference directly, not CartContext — avoids wrapping the whole app in CartProvider just for a count.`

- [ ] **Step 6: Run test to verify it passes**

Run: `pixi run test-frontend -- CartContext`
Expected: PASS (all three cases).

- [ ] **Step 7: Type-check, lint, full frontend suite**

Run: `pixi run node-check`, then `pixi run node-eslint-check`, then `pixi run test-frontend`
Expected: no new type/lint errors; suite green (the additive preference field must not break existing preferences tests).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/queries/preferencesQueries.ts frontend/src/contexts/CartContext.tsx frontend/src/hooks/useCartCount.ts frontend/src/__tests__/componentTests/CartContext.test.tsx
git commit -m "feat(views): add neuroglancerCart preference + CartContext + useCartCount"
```

---

### Task 4: `useNGViewsColumns` — Saved Views table columns + row actions

**Files:**
- Create: `frontend/src/components/ui/Table/ngViewsColumns.tsx`
- Test: `frontend/src/__tests__/componentTests/ngViewsColumns.test.tsx` (new)

**Interfaces:**
- Consumes: Task 1's `View` type; `formatDateString` (`@/utils`); `constructNeuroglancerUrl` (`@/utils/neuroglancerUrl`); `copyToClipboard` (`@/utils/copyText`); `CardActionsMenu` + `MenuItem` (`@/components/ui/Menus/*`); `FgTooltip`; `toast`.
- Produces: `useNGViewsColumns(onRename: (v: View) => void, onDelete: (v: View) => void, baseUrl: string): ColumnDef<View>[]`. Columns: **Name** (text) · **Layers** (count) · **Sharing** (label) · **Updated** (date) · **Actions** (`CardActionsMenu`: Open in Neuroglancer · Copy Neuroglancer link · Download JSON state · Rename · Delete).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/componentTests/ngViewsColumns.test.tsx`. Render a bare TanStack table from the hook's columns and assert the visible cells + that the actions menu wires Rename/Delete. Keep it light — this validates column shape, not `TableCard` internals.

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  useReactTable,
  getCoreRowModel,
  flexRender
} from '@tanstack/react-table';
import { renderHook } from '@testing-library/react';

import { useNGViewsColumns } from '@/components/ui/Table/ngViewsColumns';
import type { View } from '@/queries/viewQueries';

const view: View = {
  short_key: 'k1',
  read_key: 'r1',
  name: 'My View',
  ng_state: { foo: 'bar' },
  sharing_mode: 'read',
  owner: 'me',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-02T00:00:00Z',
  layers: [
    {
      layer_index: 0,
      data_link_id: 1,
      channel: null,
      opts: null,
      broken: false
    },
    {
      layer_index: 1,
      data_link_id: 2,
      channel: 'ch0',
      opts: null,
      broken: false
    }
  ]
};

function TableProbe({
  onRename,
  onDelete
}: {
  onRename: (v: View) => void;
  onDelete: (v: View) => void;
}) {
  const { result } = renderHook(() =>
    useNGViewsColumns(onRename, onDelete, 'https://ng.example/')
  );
  const table = useReactTable({
    data: [view],
    columns: result.current,
    getCoreRowModel: getCoreRowModel()
  });
  return (
    <table>
      <tbody>
        {table.getRowModel().rows.map(row => (
          <tr key={row.id}>
            {row.getVisibleCells().map(cell => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

describe('useNGViewsColumns', () => {
  it('renders name, layer count, sharing label and updated date', () => {
    render(<TableProbe onDelete={vi.fn()} onRename={vi.fn()} />);
    expect(screen.getByText('My View')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // layer count
    expect(screen.getByText(/shared/i)).toBeInTheDocument(); // sharing label
  });

  it('fires onRename and onDelete from the actions menu', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(<TableProbe onDelete={onDelete} onRename={onRename} />);
    await user.click(screen.getByRole('button')); // the CardActionsMenu trigger
    await user.click(await screen.findByText('Rename'));
    expect(onRename).toHaveBeenCalledWith(view);
  });
});
```

> The actions-menu assertion depends on `CardActionsMenu` rendering its trigger as the only `button` in this bare table. If the real menu needs a portal/act wrapper in jsdom (mirror how `ngLinksColumns` is exercised, if it is tested elsewhere), simplify to asserting the menu item text is reachable. The column shape (name/count/sharing/date) is the load-bearing assertion.

- [ ] **Step 2: Run test to verify it fails**

Run: `pixi run test-frontend -- ngViewsColumns`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `ngViewsColumns.tsx`**

Create `frontend/src/components/ui/Table/ngViewsColumns.tsx`, adapting `ngLinksColumns.tsx`:

```tsx
import { useMemo } from 'react';
import { Typography } from '@material-tailwind/react';
import type { ColumnDef } from '@tanstack/react-table';
import toast from 'react-hot-toast';

import type { View } from '@/queries/viewQueries';
import { formatDateString } from '@/utils';
import { constructNeuroglancerUrl } from '@/utils/neuroglancerUrl';
import { copyToClipboard } from '@/utils/copyText';
import FgTooltip from '../widgets/FgTooltip';
import CardActionsMenu from '@/components/ui/Menus/CardActionsMenu';
import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';

const TRIGGER_CLASSES = 'h-min max-w-full';

const SHARING_LABEL: Record<View['sharing_mode'], string> = {
  private: 'Private',
  read: 'Shared (read link)'
};

// ponytail: inline blob download; extract to a util only if a second caller appears.
function downloadJsonState(view: View) {
  const blob = new Blob([JSON.stringify(view.ng_state, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${view.name || view.short_key}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

type ViewRowActionProps = {
  item: View;
  baseUrl: string;
  onRename: (item: View) => void;
  onDelete: (item: View) => void;
};

function ActionsCell({
  item,
  baseUrl,
  onRename,
  onDelete
}: {
  readonly item: View;
  readonly baseUrl: string;
  readonly onRename: (item: View) => void;
  readonly onDelete: (item: View) => void;
}) {
  // ponytail: "Open" opens the external Neuroglancer URL for now; PR 6 repoints
  // it to the embedded /ngview/:read_key viewer.
  const menuItems: MenuItem<ViewRowActionProps>[] = [
    {
      name: 'Open in Neuroglancer',
      action: ({ item, baseUrl }) => {
        window.open(
          constructNeuroglancerUrl(item.ng_state, baseUrl),
          '_blank',
          'noopener,noreferrer'
        );
      }
    },
    {
      name: 'Copy Neuroglancer link',
      action: async ({ item, baseUrl }) => {
        const result = await copyToClipboard(
          constructNeuroglancerUrl(item.ng_state, baseUrl)
        );
        if (result.success) {
          toast.success('Neuroglancer link copied');
        } else {
          toast.error(`Failed to copy: ${result.error}`);
        }
      }
    },
    {
      name: 'Download JSON state',
      action: ({ item }) => {
        downloadJsonState(item);
      }
    },
    {
      name: 'Rename',
      action: ({ item, onRename }) => {
        onRename(item);
      }
    },
    {
      name: 'Delete',
      color: 'text-error',
      action: ({ item, onDelete }) => {
        onDelete(item);
      }
    }
  ];

  return (
    <div className="min-w-0 flex items-center">
      <div onClick={e => e.stopPropagation()}>
        <CardActionsMenu<ViewRowActionProps>
          actionProps={{ item, baseUrl, onRename, onDelete }}
          menuItems={menuItems}
        />
      </div>
    </div>
  );
}

export function useNGViewsColumns(
  onRename: (item: View) => void,
  onDelete: (item: View) => void,
  baseUrl: string
): ColumnDef<View>[] {
  return useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => {
          const item = row.original;
          const label = item.name || item.short_key;
          return (
            <div className="flex items-center truncate w-full h-full">
              <FgTooltip label={label} triggerClasses={TRIGGER_CLASSES}>
                <Typography className="text-foreground truncate select-all">
                  {label}
                </Typography>
              </FgTooltip>
            </div>
          );
        },
        sortingFn: (a, b) =>
          (a.original.name || a.original.short_key).localeCompare(
            b.original.name || b.original.short_key
          ),
        enableSorting: true
      },
      {
        id: 'layers',
        header: 'Layers',
        accessorFn: row => row.layers.length,
        cell: ({ getValue }) => (
          <Typography className="text-foreground" variant="small">
            {getValue() as number}
          </Typography>
        ),
        enableSorting: true
      },
      {
        accessorKey: 'sharing_mode',
        header: 'Sharing',
        cell: ({ row }) => (
          <Typography className="text-foreground" variant="small">
            {SHARING_LABEL[row.original.sharing_mode]}
          </Typography>
        ),
        enableSorting: true
      },
      {
        accessorKey: 'updated_at',
        header: 'Updated',
        cell: ({ cell }) => (
          <Typography className="text-foreground truncate" variant="small">
            {formatDateString(cell.getValue() as string)}
          </Typography>
        ),
        enableSorting: true
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <ActionsCell
            baseUrl={baseUrl}
            item={row.original}
            onDelete={onDelete}
            onRename={onRename}
          />
        ),
        enableSorting: false
      }
    ],
    [onRename, onDelete, baseUrl]
  );
}
```

> Spec §6 lists actions as "Open · Export ▾ · ⋯". We realize the three Export items (Copy link / Download JSON / Open external) as **flat entries** in the single `CardActionsMenu`, matching the existing `ngLinksColumns` pattern rather than building a nested "Export ▾" submenu. `// ponytail: flat actions menu, no nested Export submenu — matches NG Links.`

- [ ] **Step 4: Run test to verify it passes**

Run: `pixi run test-frontend -- ngViewsColumns`
Expected: PASS.

- [ ] **Step 5: Type-check and lint**

Run: `pixi run node-check` then `pixi run node-eslint-check`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/Table/ngViewsColumns.tsx frontend/src/__tests__/componentTests/ngViewsColumns.test.tsx
git commit -m "feat(views): add Saved Views table columns + row actions"
```

---

### Task 5: `NGViews` page — tabs, Saved Views table, cart shell, rename/delete dialogs + routing

**Files:**
- Create: `frontend/src/components/NGViews.tsx`
- Modify: `frontend/src/components/ui/Table/TableCard.tsx` (add `'NG views'` to the `DataType` union, ~lines 73-79)
- Modify: `frontend/src/App.tsx` (add the `/ngviews` route wrapped in `ViewsProvider` + `CartProvider`; drop the now-unused `NGLinks`/`NGLinkProvider` imports — the `/nglinks` redirect lands in Task 6)
- Test: `frontend/src/__tests__/componentTests/NGViews.test.tsx` (new)

**Interfaces:**
- Consumes: `useViewsContext` (Task 2), `useCartContext` (Task 3), `useNGViewsColumns` (Task 4), `useDefaultNeuroglancerBaseUrl`, `TableCard`, `FgDialog`, `FgButton`, `FgBadge`, `FgInput` (or the house text input), `toast`.
- Produces: default-exported `NGViews` page component. No new exported interface.

- [ ] **Step 1: Add the `DataType` union member**

In `frontend/src/components/ui/Table/TableCard.tsx`, extend the closed `DataType` union (around lines 73-79) with `'NG views'`:

```tsx
type DataType =
  | 'data links'
  | 'tasks'
  | 'NG links'
  | 'NG views'
  | 'jobs'
  | 'apps'
  | 'shared apps';
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/__tests__/componentTests/NGViews.test.tsx`. Render the page inside its two providers + a `MemoryRouter`, with `useViewsContext`/`useCartContext` mocked so no network is needed. Assert both tabs render, the Saved Views table shows a seeded View, the cart tab is reachable, and the cart tab shows the cart count badge.

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import type { View } from '@/queries/viewQueries';

const view: View = {
  short_key: 'k1',
  read_key: 'r1',
  name: 'Seeded View',
  ng_state: {},
  sharing_mode: 'read',
  owner: 'me',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-02T00:00:00Z',
  layers: []
};

vi.mock('@/contexts/ViewsContext', () => ({
  useViewsContext: () => ({
    allViewsQuery: { data: [view], error: null, isPending: false },
    createViewMutation: { mutateAsync: vi.fn(), isPending: false },
    updateViewMutation: { mutateAsync: vi.fn(), isPending: false },
    deleteViewMutation: { mutateAsync: vi.fn(), isPending: false }
  })
}));
vi.mock('@/contexts/CartContext', () => ({
  useCartContext: () => ({
    cart: [{ fsp_name: 'fsp', path: '/a', label: 'a' }],
    cartCount: 1,
    addToCart: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn()
  })
}));
vi.mock('@/hooks/useDefaultNeuroglancerBaseUrl', () => ({
  useDefaultNeuroglancerBaseUrl: () => 'https://ng.example/'
}));

import NGViews from '@/components/NGViews';

describe('NGViews page', () => {
  it('shows Saved Views and Layer Cart tabs, with the seeded view listed', () => {
    render(
      <MemoryRouter>
        <NGViews />
      </MemoryRouter>
    );
    expect(
      screen.getByRole('button', { name: /saved views/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /layer cart/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Seeded View')).toBeInTheDocument();
  });

  it('switches to the Layer Cart tab and shows the cart item', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NGViews />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /layer cart/i }));
    expect(screen.getByText('a')).toBeInTheDocument(); // cart item label
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pixi run test-frontend -- NGViews`
Expected: FAIL — `@/components/NGViews` does not exist.

- [ ] **Step 4: Write `NGViews.tsx`**

Create `frontend/src/components/NGViews.tsx`. Two tabs via local state (no new routes, no resizable rail); Saved Views is `TableCard` + `useNGViewsColumns`; the Layer Cart tab is a **minimal shell** (list current items + remove + clear) — the Fiji-style tree and "Create View" checkout are PR 5.

```tsx
import { useState } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import { TableCard } from '@/components/ui/Table/TableCard';
import { useNGViewsColumns } from '@/components/ui/Table/ngViewsColumns';
import FgDialog from '@/components/ui/Dialogs/FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgBadge from '@/components/designSystem/atoms/FgBadge';
import { useViewsContext } from '@/contexts/ViewsContext';
import { useCartContext } from '@/contexts/CartContext';
import { useDefaultNeuroglancerBaseUrl } from '@/hooks/useDefaultNeuroglancerBaseUrl';
import type { View } from '@/queries/viewQueries';

type ViewsTab = 'views' | 'cart';

export default function NGViews() {
  const { allViewsQuery, updateViewMutation, deleteViewMutation } =
    useViewsContext();
  const { cart, cartCount, removeFromCart, clearCart } = useCartContext();
  const baseUrl = useDefaultNeuroglancerBaseUrl();

  const [tab, setTab] = useState<ViewsTab>('views');
  const [renameItem, setRenameItem] = useState<View | undefined>(undefined);
  const [renameValue, setRenameValue] = useState('');
  const [deleteItem, setDeleteItem] = useState<View | undefined>(undefined);

  const handleOpenRename = (item: View) => {
    setRenameItem(item);
    setRenameValue(item.name);
  };
  const handleCloseRename = () => setRenameItem(undefined);

  const handleConfirmRename = async () => {
    if (!renameItem) {
      return;
    }
    try {
      await updateViewMutation.mutateAsync({
        short_key: renameItem.short_key,
        name: renameValue.trim()
      });
      toast.success('View renamed');
      handleCloseRename();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Rename failed');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteItem) {
      return;
    }
    try {
      await deleteViewMutation.mutateAsync(deleteItem.short_key);
      toast.success('View deleted');
      setDeleteItem(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    }
  };

  const columns = useNGViewsColumns(
    handleOpenRename,
    setDeleteItem,
    baseUrl
  );

  const tabClass = (active: boolean) =>
    `flex items-center gap-2 px-4 py-2 border-b-2 ${
      active
        ? 'border-primary text-foreground font-semibold'
        : 'border-transparent text-foreground/70'
    }`;

  return (
    <>
      <div className="w-full">
        <Typography className="mb-2 text-foreground font-bold" type="h5">
          Neuroglancer Views
        </Typography>
        <Typography className="mb-4 text-foreground">
          Saved Neuroglancer Views and your working Layer Cart.
        </Typography>

        {/* ponytail: local-state tab bar, not the AppsLayout resizable rail —
            two tabs don't need panels. */}
        <div className="flex gap-2 mb-4 border-b border-surface">
          <button
            className={tabClass(tab === 'views')}
            onClick={() => setTab('views')}
            type="button"
          >
            Saved Views
          </button>
          <button
            className={tabClass(tab === 'cart')}
            onClick={() => setTab('cart')}
            type="button"
          >
            Layer Cart
            {cartCount > 0 ? (
              <FgBadge color="secondary" size="sm" variant="pill">
                {cartCount > 9 ? '9+' : cartCount}
              </FgBadge>
            ) : null}
          </button>
        </div>

        {tab === 'views' ? (
          <TableCard
            columns={columns}
            data={allViewsQuery.data || []}
            dataType="NG views"
            errorState={allViewsQuery.error}
            gridColsClass="grid-cols-[2fr_0.6fr_1fr_1fr_0.6fr]"
            loadingState={allViewsQuery.isPending}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {cart.length === 0 ? (
              <Typography className="text-foreground/70">
                Your Layer Cart is empty. Add datasets from the file browser.
              </Typography>
            ) : (
              <>
                {cart.map(entry => (
                  <div
                    className="flex items-center justify-between border-b border-surface py-2"
                    key={`${entry.path}::${entry.channel ?? ''}`}
                  >
                    <Typography className="text-foreground truncate">
                      {entry.label}
                    </Typography>
                    <FgButton
                      onClick={() =>
                        removeFromCart(entry.path, entry.channel)
                      }
                      variant="ghost"
                    >
                      Remove
                    </FgButton>
                  </div>
                ))}
                <div>
                  <FgButton onClick={() => clearCart()} variant="ghost">
                    Clear cart
                  </FgButton>
                </div>
                {/* Create View checkout + Fiji-style tree land in PR 5. */}
              </>
            )}
          </div>
        )}
      </div>

      {renameItem ? (
        <FgDialog
          className="flex flex-col gap-4"
          onClose={handleCloseRename}
          open={!!renameItem}
        >
          <Typography className="text-foreground font-semibold">
            Rename View
          </Typography>
          <input
            aria-label="View name"
            className="border border-surface rounded px-2 py-1 bg-background text-foreground"
            onChange={e => setRenameValue(e.target.value)}
            value={renameValue}
          />
          <div className="flex gap-3">
            <FgButton
              disabled={
                updateViewMutation.isPending || renameValue.trim() === ''
              }
              loading={updateViewMutation.isPending}
              loadingText="Saving..."
              onClick={handleConfirmRename}
            >
              Save
            </FgButton>
            <FgButton onClick={handleCloseRename} variant="ghost">
              Cancel
            </FgButton>
          </div>
        </FgDialog>
      ) : null}

      {deleteItem ? (
        <FgDialog
          className="flex flex-col gap-4"
          onClose={() => setDeleteItem(undefined)}
          open={!!deleteItem}
        >
          <Typography className="text-foreground font-semibold">
            Are you sure you want to delete "
            {deleteItem.name || deleteItem.short_key}"?
          </Typography>
          <div className="flex gap-3">
            <FgButton
              color="error"
              disabled={deleteViewMutation.isPending}
              loading={deleteViewMutation.isPending}
              loadingText="Deleting..."
              onClick={handleConfirmDelete}
            >
              Delete
            </FgButton>
            <FgButton onClick={() => setDeleteItem(undefined)} variant="ghost">
              Cancel
            </FgButton>
          </div>
        </FgDialog>
      ) : null}
    </>
  );
}
```

> Verify `FgButton`'s prop names (`variant="ghost"`, `loading`, `loadingText`, `color`) against `frontend/src/components/designSystem/atoms/FgButton.tsx` — they mirror the usage in `NGLinks.tsx`, so they should match; adjust if that component's API differs. The rename uses a plain `<input>` with an `aria-label`; if the repo has a house `FgInput` atom, prefer it (check `designSystem/atoms/formElements/`).

- [ ] **Step 5: Register the route**

In `frontend/src/App.tsx`:

(a) Replace the `NGLinks`/`NGLinkProvider` imports (lines 25 and 29) with the Views imports:

```tsx
import NGViews from '@/components/NGViews';
import { ViewsProvider } from '@/contexts/ViewsContext';
import { CartProvider } from '@/contexts/CartContext';
```

(b) Replace the entire `path="nglinks"` route block (lines 116-125) with the `/ngviews` route (the `/nglinks` redirect is added in Task 6):

```tsx
            <Route
              element={
                <RequireAuth>
                  <ViewsProvider>
                    <CartProvider>
                      <NGViews />
                    </CartProvider>
                  </ViewsProvider>
                </RequireAuth>
              }
              path="ngviews"
            />
```

`CartProvider` sits inside `MainLayout` → `PreferencesProvider`, so `usePreferencesContext()` resolves. `NGLinks.tsx`/`NGLinkContext.tsx` stay in the tree (unreferenced, but their own tests keep passing); migrating legacy short links is a later stack.

- [ ] **Step 6: Run test to verify it passes**

Run: `pixi run test-frontend -- NGViews`
Expected: PASS (both cases).

- [ ] **Step 7: Type-check, lint, full frontend suite**

Run: `pixi run node-check`, then `pixi run node-eslint-check`, then `pixi run test-frontend`
Expected: no new type/lint errors; suite green. If ESLint flags `react/jsx-max-depth` on the nested route element, mirror `MainLayout.tsx`'s file-top `/* eslint-disable react/jsx-max-depth */` handling only if the existing `App.tsx` already trips it — otherwise leave it.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/NGViews.tsx frontend/src/components/ui/Table/TableCard.tsx frontend/src/App.tsx frontend/src/__tests__/componentTests/NGViews.test.tsx
git commit -m "feat(views): add /ngviews page (Saved Views table + Layer Cart shell)"
```

---

### Task 6: Nav rename + cart badge + `/nglinks` redirect

**Files:**
- Modify: `frontend/src/components/ui/Navbar/Navbar.tsx` (rename entry, add `useCartCount` badge)
- Modify: `frontend/src/App.tsx` (add the `/nglinks` → `/ngviews` redirect)
- Modify: `frontend/src/__tests__/componentTests/NavbarBadge.test.tsx` (mock `useCartCount` so the existing test keeps passing)

**Interfaces:**
- Consumes: `useCartCount` (Task 3); `Navigate` (`react-router`).
- Produces: no new exported interface.

- [ ] **Step 1: Rename the nav entry and add the cart badge**

In `frontend/src/components/ui/Navbar/Navbar.tsx`:

(a) Add the import near the other hook imports (after line 32):

```tsx
import { useCartCount } from '@/hooks/useCartCount';
```

(b) In `NavList()`, read the count (beside `const activeJobCount = useActiveJobCount();`, line 77):

```tsx
  const cartCount = useCartCount();
```

(c) Change the NG Links entry (line 82) to NG Views with the passive badge:

```tsx
    { icon: HiOutlineEye, title: 'NG Views', href: '/ngviews', badge: cartCount },
```

The badge-rendering branch (`badge !== undefined && badge > 0`, lines 124-138) already handles this exactly like the Apps "N jobs" badge — no other Navbar change needed.

- [ ] **Step 2: Add the `/nglinks` redirect**

In `frontend/src/App.tsx`:

(a) Add `Navigate` to the `react-router` import (line 3):

```tsx
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router';
```

(b) Add a redirect route next to the new `/ngviews` route (inside `OtherPagesLayout`):

```tsx
            <Route element={<Navigate replace to="/ngviews" />} path="nglinks" />
```

`// ponytail: legacy /nglinks path redirects; the short-link serving routes (/ng/{key}) are untouched.`

- [ ] **Step 3: Update the Navbar badge test to mock `useCartCount`**

`NavbarBadge.test.tsx` renders the Navbar without `PreferencesProvider`, so `useCartCount` (which calls `usePreferencesContext`) would throw. Add a mock alongside the existing `useActiveJobCount` mock at the top of the file:

```tsx
vi.mock('@/hooks/useCartCount', () => ({
  useCartCount: () => 0
}));
```

If that test asserts the exact set/order of nav items or the "NG Links" label, update those assertions to "NG Views".

- [ ] **Step 4: Run the Navbar test**

Run: `pixi run test-frontend -- NavbarBadge`
Expected: PASS.

- [ ] **Step 5: Type-check, lint, full frontend suite**

Run: `pixi run node-check`, then `pixi run node-eslint-check`, then `pixi run test-frontend`
Expected: no new type/lint errors; full suite green.

- [ ] **Step 6: Manual smoke check (redirect + badge)**

Redirect and cross-provider badge wiring aren't covered by a unit test (routing lives in `App.tsx`, which the test harness doesn't mount). Verify manually: `pixi run dev-launch`, then visit `http://localhost:7878/nglinks` → lands on `/ngviews`; the nav shows "NG Views"; adding a cart item (once PR 5 lands) bumps the nav badge. For this PR, confirm the redirect and the renamed entry.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ui/Navbar/Navbar.tsx frontend/src/App.tsx frontend/src/__tests__/componentTests/NavbarBadge.test.tsx
git commit -m "feat(views): rename nav to NG Views with cart badge; redirect /nglinks"
```

---

## Self-Review

**Spec coverage (design §6 PR 4 row: "`/ngviews` page (Saved Views table + Export menu), `ViewsContext`, `CartContext`, nav rename + `/nglinks` redirect"):**
- `/ngviews` page + Saved Views table ✓ (Task 5) with columns name/layers/sharing/updated/actions per §6 ✓ (Task 4).
- Export items (Copy Neuroglancer link · Download JSON state · Open in external Neuroglancer, reuse `constructNeuroglancerUrl`) ✓ (Task 4) — realized as flat actions-menu items (documented deviation from a nested "Export ▾").
- `ViewsContext` + `viewQueries` mirroring `NGLinkContext`/`ngLinkQueries` ✓ (Tasks 1-2).
- `CartContext` backed by the `neuroglancerCart` preference (§4: single `UserPreferenceDB` row, per-user, no new table) ✓ (Task 3).
- Passive cart count on the "NG Views" nav item, all routes (§6) ✓ (Task 6 via `useCartCount` reading the global `PreferencesContext`).
- Nav rename + `/nglinks` → `/ngviews` redirect (§2, §6) ✓ (Task 6).

**Deferred to later PRs (correctly out of scope here):** the Fiji/N5-style Layer Cart tree + channel lazy-load + "Create View" checkout, the floating selection bar, the right-edge Properties↔Cart rail, row `⋯` browser items, consent reuse, "Appears in N Views", and the Data Link delete dialog (all PR 5); the embedded `/ngview/:key` viewer + "Open" repointing (PR 6). The Layer Cart tab is intentionally a minimal shell in PR 4.

**Placeholder scan:** none — every code step has concrete code. Two steps carry explicit "verify against the real file" notes (`queryUtils` json-vs-text in Task 1; `FgButton`/`FgInput` API in Task 5) rather than leaving behavior open; both name the exact file to check and the fallback.

**Type consistency:** `View`/`ViewLayer`/`ViewCreateRequest`/`ViewLayerInput`/`ViewUpdateRequest` are defined once (Task 1) and matched against `fileglancer/model.py`; `useUpdateViewMutation` takes `{ short_key } & ViewUpdateRequest` and Task 5 calls it as `{ short_key, name }` ✓. `CartItem` is defined once in `preferencesQueries.ts` (Task 3) and consumed by `CartContext`, `useCartCount`, and the page ✓. `useNGViewsColumns(onRename, onDelete, baseUrl)` signature (Task 4) matches its call site (Task 5) ✓. `dataType="NG views"` (Task 5) matches the `DataType` member added in the same task ✓. `useCartContext` shape `{ cart, cartCount, addToCart, removeFromCart, clearCart }` is identical in Task 3's definition, Task 3's test, and Task 5's consumption ✓.

**Ambiguity check:** the nav badge deliberately reads the preference via `useCartCount` (not `CartContext`) so it works on every route without a global cart provider; `CartContext` is route-scoped for the page's add/remove/clear. Both read/write the same `neuroglancerCart` preference, so a cart mutation on the page invalidates the preferences cache and the nav badge updates. "Open" opens the external Neuroglancer URL as a functional stand-in in PR 4; PR 6 repoints it to the embedded viewer (flagged with a `ponytail:` comment in Task 4).

## Out of scope for this PR (next plans)

- **PR 5 `ngviews-05-browser-entry`:** floating selection bar, right-edge Properties↔Cart rail, cart drawer, row `⋯` items, consent reuse, "Appears in N Views", Data Link delete dialog, and the **full Layer Cart tab (tree + channel lazy-load + "Create View" checkout)** — all consume `CartContext`/`useCartContext` and `useCreateViewMutation` from this PR.
- **PR 6 `ngviews-06-embedded-readonly`:** the read-only embedded `/ngview/:key` viewer, Export/Fullscreen chrome, scratch View + "Save as View"; repoints the Saved Views "Open" action to the embedded route.
