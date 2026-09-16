# Neuroglancer Views: dev-deployment feedback fixes (design)

**Date:** 2026-09-16
**Stack position:** three new branches stacked on `ngviews-07-cart-and-viewer-polish`
**Source:** bugs and change requests from the 3.3.0a0 test release on dev

This spec groups thirteen feedback items into three stacked branches, records the
design decision for each item, and lists the files each branch touches. Each branch
has its own implementation plan in `docs/superpowers/plans/`.

## Branch layout

| Branch | Items | Theme | Backend? |
|---|---|---|---|
| `ngviews-08-broken-source-tracking` | 1, 2, 3, 4 | Data Link deletion and broken layers | Yes (migration + query fix) |
| `ngviews-09-cart-ux` | 5, 6, 7, 8, 9, 11 | Layer Cart behaviour and entry points | No |
| `ngviews-10-viewer-polish` | 10, 12, 13 | Embedded viewer and Views-table copy | No |

Rationale for the split:

- Branch 08 is the only one that needs a migration and changes the `ViewLayer` API
  shape. Keeping it first means the two frontend-only branches rebase cleanly on a
  stable API and the backend change can ship to dev on its own.
- Branch 09 is everything that changes how datasets enter and appear in the cart.
  Item 11 (file-browser context menu) lands here rather than in 10 because it edits
  the same `FileBrowser.tsx` menu items that item 8 edits.
- Branch 10 is copy and one small feature (inline rename) on surfaces that read a
  View. It touches no cart code.

## Branch 08: broken source tracking

### Item 1: Postgres `DISTINCT` on `views.ng_state` (bug)

`get_views_for_data_link` joins `views` to `view_layers` and applies `.distinct()` to
de-duplicate Views that have several layers on one Data Link. Postgres cannot apply
`DISTINCT` across a `json` column (`could not identify an equality operator for type
json`). SQLite tolerates it, so the bug only appears on dev.

**Decision:** drop the join and the `DISTINCT`. Filter Views by
`ViewDB.id.in_(<subquery of view_layers.view_id where data_link_id = X>)`. The
`IN` subquery de-duplicates by construction and never compares `ng_state`.

The existing test `test_get_views_for_data_link` already asserts one result for two
matching layers. CI runs SQLite, so the Postgres failure itself cannot be reproduced
in tests; the spec notes this and the fix is verified by reasoning about the emitted
SQL plus a manual check on dev.

### Item 3: track source path independently of the Data Link

**Confirmed: today a `ViewLayer` stores only `data_link_id`.** When the Data Link is
deleted, `mark_view_layers_broken` nulls `data_link_id` and sets `broken = true`, so
the layer loses all knowledge of which file share path (FSP) and subpath it came from.
The Views table then cannot show a source for that layer, which is the cause of item 2.

**Decision:** add two nullable string columns to `view_layers`: `fsp_name` and `path`.

- Populated at View creation from the resolved Data Link (`ProxiedPathDB.fsp_name`,
  `ProxiedPathDB.path`). The create endpoint already looks the Data Link up by
  `sharing_key`, so no extra query.
- Left untouched by `mark_view_layers_broken`. A broken layer keeps `fsp_name`/`path`.
- Backfilled for existing rows in the migration via a correlated `UPDATE ... FROM
  proxied_paths` (works on SQLite and Postgres). Rows already broken before this
  migration have no link to backfill from and stay null; the frontend shows an em dash
  for those, same as today.
- Exposed on the `ViewLayer` Pydantic model and the frontend `ViewLayer` type.

This is what makes a future "restore broken view" feature possible: a broken layer
still says which FSP + path it needs, so a new Data Link can be created for it.

### Item 2: keep the source path visible for broken layers

**Decision:** the Sources column in the Views table reads `layer.fsp_name` /
`layer.path` directly. The current lookup through the user's Data Links list
(`useAllProxiedPathsQuery` + `pathById`) is deleted, which also removes one query from
the page.

Per unique source, if any of its layers is `broken`, render a broken-link icon
(`MdLinkOff` from `react-icons/md`, already bundled) in front of the path with tooltip
text: "The data link for this source no longer exists, so it won't appear in this
View." The path stays a browse link because the files themselves still exist.

### Item 4: show dependent Views immediately in the delete dialog

Today the delete dialog fires the delete, catches the 409 `DependentViewsError`, then
re-renders with the list and a "Delete anyway" button. Two clicks.

**Decision:** the delete branch of `DataLinkDialog` calls
`useViewsForDataLinkQuery(proxiedPath.sharing_key)` when it opens. If the query
returns one or more Views, the dependent-Views block renders immediately and the
single Delete button sends `confirm = true`. The block gets a stronger visual
treatment: warning-colour left border and heading (`border-l-4 border-warning`,
`text-warning` heading), body text unchanged. The button label stays "Delete".

The `DependentViewsError` catch stays as a fallback for the race where a View is
created between the query and the click; in that case the list appears and the
next click confirms, exactly as today.

## Branch 09: cart UX

### Item 5: detect layer compatibility as soon as a dataset is in the cart

Checkout (`viewCheckout.ts` → `generateStateForDataset`) already decides what a
dataset is: OME-Zarr multiscale → image layer(s); otherwise try plain Zarr array →
one layer; otherwise skipped. The cart currently only learns this at checkout time,
and the dimension check (`useCartDimensionCheck`) separately fetches OME metadata.

**Decision:** extract the classification into one exported function in
`viewCheckout.ts`:

```ts
export type DatasetProbe =
  | { kind: 'ome'; metadata: Metadata }
  | { kind: 'array' }
  | { kind: 'unsupported' };
export async function probeDataset(url: string): Promise<DatasetProbe>;
```

`generateStateForDataset` calls it, and `useCartDimensionCheck`'s per-dataset query
uses it as its `queryFn` (query key unchanged, still cached 5 minutes). The hook
returns an additional `kindByKey: Map<string, DatasetProbe['kind'] | 'loading'>`.
The dimension signature is computed only for `kind === 'ome'`.

`CartDatasetRow` receives `kind` and renders one indicator next to the label:

| kind | icon | tooltip |
|---|---|---|
| `ome`, `array` | `HiOutlineCheckCircle`, `text-success` | "Will load as a Neuroglancer layer" |
| `unsupported` | `HiOutlineXCircle`, `text-error` | "Not a Zarr dataset. It won't appear as a layer in Neuroglancer." |
| `loading` | none | |

The existing dimension-mismatch warning icon is unchanged and sits after the new
indicator.

### Item 6: remove "New View from selection"

**Decision:** delete the `CreateViewButton` from `SelectionBar`. The bar keeps
"Add N to cart" and "Clear". Users go through the cart, where item 5's indicator
tells them what will happen before they create a View. The "Create view" tile in
the Zarr metadata preview and the cart's own Create View button are unchanged.

### Item 7: cart badge counts datasets, not channel checkboxes

Each checked channel is its own `CartItem`, so the badge (`useCartCount`) counts a
dataset with three checked channels as four.

**Decision:** `useCartCount` returns the number of unique `datasetKey(fsp_name,
path)` values in the cart. This matches the number of rows in the cart list.

### Item 8: "Add to cart" opens the cart drawer

Drawer state lives in `useLayoutPrefs` (in `BrowseLayout`) and reaches page
components through the router outlet context. `selectDrawerMode(mode)` is a toggle:
calling it while the cart is already open closes it.

**Decision:** add `openDrawer(mode)` to `useLayoutPrefs` and `OutletContextType`. It
sets the mode and forces the drawer open without toggling. `SelectionBar`'s
"Add N to cart" and the file-browser context-menu "Add to cart" call
`openDrawer('cart')` after a successful add. Both read the outlet context
defensively (`useOutletContext<OutletContextType | undefined>()`), so component
tests that render them without a router outlet keep working.

### Item 9: focus the name input in the Create View dialog

**Decision:** the `FgInput` in `useCreateViewFlow`'s dialog gets `autoFocus` and
`onFocus={e => e.target.select()}` so the default name is selected and typing
replaces it. `FgInput` forwards unknown props to the native input, so no component
change. If the Material Tailwind dialog's own focus management wins the race in the
browser, fall back to a `useEffect` that focuses a ref on open.

### Item 11: file-browser context menu copy

**Decision:** remove the "View in Neuroglancer" menu item and the `useCreateViewFlow`
wiring in `FileBrowser.tsx` that only it used. Rename "Add to Neuroglancer cart" to
"Add to cart" and shorten its toasts to "Added "X" to the cart" / "Error adding
"X" to the cart: ...". Delete `FileBrowserViewInNg.test.tsx`; update the cart-item
test strings.

## Branch 10: viewer and copy polish

### Item 10: rename the View from the embedded viewer

The embedded viewer fetches only raw `ng_state` by `read_key` (public endpoint), so it
does not know the View's `name` or `short_key`. Rename needs both plus ownership.

**Decision:** in `NeuroglancerView`, call `useViewsQuery()` (the owner's own Views,
already cached app-wide) and look up `views.find(v => v.read_key === readKey)`. When
found, the user owns this View: show the name with an inline rename editor. When not
found (another user's View, or the list is still loading), show the read-only title
as today. Title precedence becomes `ownedView?.name ?? ngState.title ?? 'Untitled
View'`.

The editor is the jobs-page widget generalised: extract `InlineNameEditor`
(`frontend/src/components/ui/widgets/InlineNameEditor.tsx`) from `JobTitleEditor`
with props `{ value, label, onSave(name): Promise<void>, typographyProps? }`.
`JobTitleEditor` becomes a thin wrapper that supplies the job mutation and toasts.
The viewer supplies `updateViewMutation` from `useViewsContext()` and toasts
"View renamed". Behaviour (pencil icon, Enter saves, Escape cancels, check/x
buttons) is unchanged for jobs.

### Item 12: share icon and tooltip in the embedded viewer

**Decision:** replace `HiOutlineDuplicate` with `HiOutlineShare` (react-icons/hi) and
change the label to "Copy link to share". Success toast becomes "View link copied".

### Item 13: Views table actions menu copy

**Decision:** "Open in Neuroglancer" → "Open View"; "Copy Neuroglancer link" →
"Copy View link to share"; its success toast → "View link copied". No behaviour change.

## Copy rules (all branches)

- User-facing text says "View" / "Views" and "cart", never "Neuroglancer cart" or
  "NG View".
- Toasts for copying a View link say "View link copied".

## Testing

- Backend (`pixi run -e test test-backend`): new assertions in `tests/test_database.py`
  for `fsp_name`/`path` persistence and survival through `mark_view_layers_broken`;
  `tests/test_endpoints.py` delete-then-confirm test asserts the broken layer still
  reports its source. `get_views_for_data_link` keeps its existing dedupe test.
- Frontend (`pixi run test-frontend`): each UI change updates or adds a Vitest
  component test; the plans list exact files.
- UI tests (`pixi run test-ui`): `data-link-operations.spec.ts` dependent-Views
  flow becomes a single-click delete; update the locator flow.
- Manual on dev after 08 merges: delete a Data Link that backs a View on Postgres.

## Out of scope

- Restoring broken Views (item 3 only preserves the data needed for it).
- Disabling Create View when every cart row is unsupported.
- Enter-to-submit in the Create View dialog.
- Persisting drawer mode across reloads.
