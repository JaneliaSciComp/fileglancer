# ngviews-08 Broken Source Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Postgres 500 on Data Link deletion, make View layers remember their source FSP + path after their Data Link is gone, show broken sources in the Views table, and make the delete dialog a single click.

**Architecture:** Backend first: rewrite one query, add two columns via Alembic with a backfill, populate them at View creation, expose them on the API. Frontend then reads `layer.fsp_name`/`layer.path` directly (dropping the Data Links lookup) and the delete dialog pre-fetches dependent Views with the existing `useViewsForDataLinkQuery`.

**Tech Stack:** FastAPI, SQLAlchemy (sync), Alembic, Pydantic; React 18, TanStack Query v5, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-16-ngviews-dev-feedback-design.md` (Branch 08 section).

## Global Constraints

- Always run tools through pixi (`pixi run -e test test-backend`, `pixi run test-frontend`, `pixi run node-check`, `pixi run node-prettier-write`, `pixi run node-eslint-check`).
- Branch: `git checkout -b ngviews-08-broken-source-tracking ngviews-07-cart-and-viewer-polish`, then `gh stack` conventions used by the earlier PRs.
- Verify the live Alembic head before writing the migration (Task 2 has the command). On this stack it is expected to be `1e8dc304b4f2`.
- User-facing copy: "View"/"Views", never "NG View".
- Lefthook does not fire from `/opt/fileglancer`; run prettier + eslint checks manually before pushing.

---

### Task 1: Remove `DISTINCT` from `get_views_for_data_link`

**Files:**
- Modify: `fileglancer/database.py:1087-1098`
- Test: `tests/test_database.py:382-393` (existing, keep passing)

**Interfaces:**
- Produces: `get_views_for_data_link(session, data_link_id, owner=None) -> List[ViewDB]` (signature unchanged).

- [ ] **Step 1: Run the existing test to confirm the baseline passes**

Run: `pixi run -e test pytest tests/test_database.py -k views_for_data_link -v`
Expected: 2 PASS.

- [ ] **Step 2: Rewrite the query**

Replace the body of `get_views_for_data_link` with:

```python
def get_views_for_data_link(session: Session, data_link_id: int, owner: Optional[str] = None) -> List[ViewDB]:
    """Views that have at least one layer backed by this Data Link.
    If `owner` is given, restrict to Views owned by that user (used to avoid
    disclosing other users' Views when guarding a Data Link deletion).

    Uses an IN-subquery instead of JOIN + DISTINCT: Postgres cannot DISTINCT
    over the `json` column `views.ng_state` ("could not identify an equality
    operator for type json"), and IN de-duplicates by construction."""
    layer_view_ids = (
        session.query(ViewLayerDB.view_id)
        .filter(ViewLayerDB.data_link_id == data_link_id)
    )
    query = session.query(ViewDB).filter(ViewDB.id.in_(layer_view_ids))
    if owner is not None:
        query = query.filter(ViewDB.owner == owner)
    return query.all()
```

- [ ] **Step 3: Run the tests again**

Run: `pixi run -e test pytest tests/test_database.py -k "views_for_data_link" tests/test_endpoints.py -k "dependent or data_link" -v`
Expected: all PASS (the dedupe assertion in `test_get_views_for_data_link` still holds).

- [ ] **Step 4: Commit**

```bash
git add fileglancer/database.py
git commit -m "fix(views): avoid DISTINCT over json ng_state when finding dependent Views

Postgres cannot compare json columns, so JOIN + DISTINCT failed with 500 on
Data Link delete. Filter by an IN-subquery over view_layers.view_id instead."
```

---

### Task 2: Add `fsp_name` and `path` columns to `view_layers`

**Files:**
- Create: `fileglancer/alembic/versions/<newrev>_add_source_to_view_layers.py`
- Modify: `fileglancer/database.py:158-171` (`ViewLayerDB`), `fileglancer/database.py:1001-1035` (`create_view`)
- Modify: `fileglancer/model.py:170-184` (`ViewLayer`)
- Test: `tests/test_database.py`

**Interfaces:**
- Produces: `ViewLayerDB.fsp_name: Optional[str]`, `ViewLayerDB.path: Optional[str]`; `create_view` layer dicts accept optional `fsp_name` and `path`; Pydantic `ViewLayer` has `fsp_name: Optional[str]` and `path: Optional[str]`.

- [ ] **Step 1: Confirm the Alembic head**

Run:
```bash
cd fileglancer/alembic/versions && for f in *.py; do r=$(grep -h "^revision" $f | cut -d"'" -f2); grep -q "down_revision = '$r'" *.py || echo "HEAD: $f"; done; cd -
```
Expected: exactly one line, `HEAD: 1e8dc304b4f2_add_views_tables.py`. If it differs, use that revision as `down_revision` below.

- [ ] **Step 2: Write the failing database test**

Append to `tests/test_database.py` (imports for `create_view`, `mark_view_layers_broken`, `get_view_by_short_key`, `ViewLayerDB` already exist in that file):

```python
def test_view_layers_keep_source_after_broken(db_session):
    layers = [
        {"data_link_id": 5, "layer_index": 0, "channel": None, "opts": None,
         "fsp_name": "scratch", "path": "/data/img.zarr"},
    ]
    v = create_view(db_session, "u", "src", {"layers": []}, layers, "read")
    layer = get_view_by_short_key(db_session, v.short_key).layers[0]
    assert layer.fsp_name == "scratch"
    assert layer.path == "/data/img.zarr"

    mark_view_layers_broken(db_session, 5)
    db_session.refresh(v)
    layer = v.layers[0]
    assert layer.broken is True and layer.data_link_id is None
    # Source survives the break so a broken View can be restored later.
    assert layer.fsp_name == "scratch"
    assert layer.path == "/data/img.zarr"
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pixi run -e test pytest tests/test_database.py::test_view_layers_keep_source_after_broken -v`
Expected: FAIL with `TypeError: 'fsp_name' is an invalid keyword argument for ViewLayerDB` or an `AttributeError` on `layer.fsp_name`.

- [ ] **Step 4: Add the ORM columns**

In `ViewLayerDB` (`fileglancer/database.py`), after the `opts` column:

```python
    # Source of this layer, kept even after the Data Link is deleted so a
    # broken View can be shown (and later restored) by path.
    fsp_name = Column(String, nullable=True)
    path = Column(String, nullable=True)
```

In `create_view`, extend the layer construction:

```python
    for layer in layers:
        view.layers.append(ViewLayerDB(
            data_link_id=layer.get('data_link_id'),
            layer_index=layer['layer_index'],
            channel=layer.get('channel'),
            opts=layer.get('opts'),
            fsp_name=layer.get('fsp_name'),
            path=layer.get('path'),
        ))
```

Update the docstring line to: `Each layer dict: {data_link_id, layer_index, channel, opts, fsp_name, path}.`

- [ ] **Step 5: Add the Pydantic fields**

In `fileglancer/model.py`, class `ViewLayer`, after `opts`:

```python
    fsp_name: Optional[str] = Field(
        default=None,
        description="File share path name of this layer's source; kept when the Data Link is deleted",
    )
    path: Optional[str] = Field(
        default=None,
        description="Path (relative to the FSP mount) of this layer's source; kept when the Data Link is deleted",
    )
```

- [ ] **Step 6: Write the migration**

Create `fileglancer/alembic/versions/7c3e9a2d5b41_add_source_to_view_layers.py`:

```python
"""add fsp_name and path to view_layers

Revision ID: 7c3e9a2d5b41
Revises: 1e8dc304b4f2
Create Date: 2026-09-16 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7c3e9a2d5b41'
down_revision = '1e8dc304b4f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('view_layers', sa.Column('fsp_name', sa.String(), nullable=True))
    op.add_column('view_layers', sa.Column('path', sa.String(), nullable=True))
    # Backfill from the still-linked Data Link. Correlated subqueries run on
    # both SQLite and Postgres. Layers already broken before this migration
    # have no link to copy from and stay NULL.
    op.execute(
        """
        UPDATE view_layers
        SET fsp_name = (SELECT fsp_name FROM proxied_paths WHERE proxied_paths.id = view_layers.data_link_id),
            path     = (SELECT path     FROM proxied_paths WHERE proxied_paths.id = view_layers.data_link_id)
        WHERE data_link_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column('view_layers', 'path')
    op.drop_column('view_layers', 'fsp_name')
```

- [ ] **Step 7: Run the database tests**

Run: `pixi run -e test pytest tests/test_database.py -k view -v`
Expected: all PASS including the new test. (The test fixture creates tables from the ORM metadata, so the migration is exercised separately in Step 8.)

- [ ] **Step 8: Exercise the migration against a scratch SQLite database**

`fileglancer/alembic/env.py` reads the URL from `get_settings().db_url`, which is driven by the `FILEGLANCER_DB_URL` environment variable (check `fileglancer/settings.py` for the exact env prefix if this name fails).

Run:
```bash
FG_DB=$(mktemp -d)/fg.sqlite
FILEGLANCER_DB_URL=sqlite:///$FG_DB pixi run migrate
pixi run python -c "import sqlite3; c=sqlite3.connect('$FG_DB'); print([r[1] for r in c.execute('pragma table_info(view_layers)')])"
```
Expected: `upgrade head` completes with no errors and the printed column list includes `'fsp_name'` and `'path'`.

- [ ] **Step 9: Commit**

```bash
git add fileglancer/database.py fileglancer/model.py fileglancer/alembic/versions/7c3e9a2d5b41_add_source_to_view_layers.py tests/test_database.py
git commit -m "feat(views): persist fsp_name and path on view_layers

Layers previously knew their source only through data_link_id, which is
nulled when the Data Link is deleted. Store the source directly so broken
Views keep showing (and can later be restored by) their path. Backfills
existing linked layers."
```

---

### Task 3: Populate the source at View creation (API)

**Files:**
- Modify: `fileglancer/server.py:1536-1559` (`create_view_endpoint`)
- Test: `tests/test_endpoints.py:2177-2194` (`test_delete_data_link_blocks_then_confirms_marks_broken`)

**Interfaces:**
- Consumes: `create_view` layer dicts with `fsp_name`/`path` (Task 2).
- Produces: `GET /api/neuroglancer/views/{short_key}` layers include `fsp_name` and `path`.

- [ ] **Step 1: Extend the endpoint test**

In `tests/test_endpoints.py`, in `test_delete_data_link_blocks_then_confirms_marks_broken`, after the two existing `assert view["layers"][0]...` lines add:

```python
    # source survives the deletion
    assert view["layers"][0]["fsp_name"] is not None
    assert view["layers"][0]["path"] is not None
```

Then in `test_dependent_views_endpoint` (line ~2167), after the existing `assert [v["name"] ...] == ["uses dl1"]` line, add (the helper `_make_proxied_path` registers FSP `tempdir` with the subdir as the path):

```python
    layer = resp.json()["views"][0]["layers"][0]
    assert layer["fsp_name"] == "tempdir"
    assert layer["path"] == "dl1"
```

In `test_views_crud` (line ~2075) the layer has no `sharing_key`, so add after the `channel == "Ch0"` assertion:

```python
    assert created["layers"][0]["fsp_name"] is None and created["layers"][0]["path"] is None
```

- [ ] **Step 2: Run to confirm failure**

Run: `pixi run -e test pytest tests/test_endpoints.py -k "views_crud or blocks_then_confirms" -v`
Expected: FAIL on the new `fsp_name` assertions (currently `None`).

- [ ] **Step 3: Populate from the resolved Data Link**

In `create_view_endpoint`, change the loop:

```python
            layers = []
            for layer in payload.layers:
                data_link_id = None
                fsp_name = None
                path = None
                if layer.sharing_key:
                    pp = db.get_proxied_path_by_sharing_key(session, layer.sharing_key)
                    if not pp:
                        raise HTTPException(status_code=400,
                                            detail=f"Unknown data link sharing key: {layer.sharing_key}")
                    data_link_id = pp.id
                    fsp_name = pp.fsp_name
                    path = pp.path
                layers.append({
                    "data_link_id": data_link_id,
                    "layer_index": layer.layer_index,
                    "channel": layer.channel,
                    "opts": layer.opts,
                    "fsp_name": fsp_name,
                    "path": path,
                })
```

- [ ] **Step 4: Run the endpoint tests**

Run: `pixi run -e test pytest tests/test_endpoints.py -k "view" -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add fileglancer/server.py tests/test_endpoints.py
git commit -m "feat(views): record each layer's fsp_name and path at creation"
```

---

### Task 4: Views table reads source from the layer and flags broken links

**Files:**
- Modify: `frontend/src/queries/viewQueries.ts:16-23` (`ViewLayer` type)
- Modify: `frontend/src/components/ui/Table/ngViewsColumns.tsx`
- Test: `frontend/src/__tests__/componentTests/ngViewsColumns.test.tsx`

**Interfaces:**
- Consumes: API `ViewLayer.fsp_name`, `ViewLayer.path` (Task 3).
- Produces: `ViewLayer` TS type gains `fsp_name: string | null; path: string | null`.

- [ ] **Step 1: Update the type**

In `frontend/src/queries/viewQueries.ts`, add to `ViewLayer`:

```ts
  fsp_name: string | null;
  path: string | null;
```

Run `pixi run node-check` and fix any test fixtures that construct `ViewLayer` objects (add `fsp_name`/`path`).

- [ ] **Step 2: Write the failing tests**

Open `frontend/src/__tests__/componentTests/ngViewsColumns.test.tsx`. Find the `View` fixture(s) and the test `renders a browse link per layer source`. Update the fixture so layers carry the source directly, and remove the `useAllProxiedPathsQuery` mock (the column no longer uses it):

```ts
layers: [
  { layer_index: 0, data_link_id: 1, channel: null, opts: null, broken: false,
    fsp_name: 'fspA', path: '/a/one.zarr' },
  { layer_index: 1, data_link_id: null, channel: null, opts: null, broken: true,
    fsp_name: 'fspA', path: '/a/two.zarr' }
]
```

Add a test:

```ts
it('keeps the path and shows a broken-link icon for layers whose Data Link is gone', async () => {
  renderTable(); // the file's existing render helper
  const brokenLink = screen.getByRole('link', { name: /two\.zarr/ });
  expect(brokenLink).toHaveAttribute('href', expect.stringContaining('two.zarr'));
  expect(screen.getByLabelText('Data link missing')).toBeInTheDocument();
  // the intact source has no broken icon
  expect(screen.getAllByLabelText('Data link missing')).toHaveLength(1);
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `pixi run test-frontend -- ngViewsColumns`
Expected: FAIL (`Data link missing` not found; possibly the mocked proxied paths query is now unused).

- [ ] **Step 4: Rewrite the Sources cell**

In `ngViewsColumns.tsx`:

1. Remove the imports `useAllProxiedPathsQuery` and the `pathById` memo, and drop `pathById` from the returned memo's dependency list.
2. Add imports:
   ```ts
   import { MdLinkOff } from 'react-icons/md';
   import FgIcon from '@/components/designSystem/atoms/FgIcon';
   ```
3. Replace the source-collection loop in the `sources` cell with:

```ts
          // De-dupe: per-channel layers of one dataset share a source path.
          // A source is broken if any of its layers lost its Data Link.
          const bySource = new Map<
            string,
            { fsp_name: string; path: string; broken: boolean }
          >();
          for (const layer of row.original.layers) {
            if (!layer.fsp_name || !layer.path) {
              continue; // pre-migration broken layer: source unknown
            }
            const key = `${layer.fsp_name}::${layer.path}`;
            const existing = bySource.get(key);
            if (existing) {
              existing.broken = existing.broken || layer.broken;
            } else {
              bySource.set(key, {
                fsp_name: layer.fsp_name,
                path: layer.path,
                broken: layer.broken
              });
            }
          }
          const sources = [...bySource.values()];
```

4. In the `sources.map(...)` render, wrap the link so a broken icon precedes it:

```tsx
                return (
                  <div
                    className="flex items-center gap-1 min-w-0"
                    key={`${src.fsp_name}::${src.path}`}
                  >
                    {src.broken ? (
                      <FgTooltip label="The data link for this source no longer exists, so it won't appear in this view.">
                        <span aria-label="Data link missing" role="img">
                          <FgIcon
                            className="text-error shrink-0"
                            icon={MdLinkOff}
                            size="sm"
                          />
                        </span>
                      </FgTooltip>
                    ) : null}
                    <Link
                      className="block max-w-full truncate text-primary text-xs text-left hover:underline"
                      onClick={e => e.stopPropagation()}
                      title={fullPath}
                      to={makeBrowseLink(src.fsp_name, src.path)}
                    >
                      {fullPath}
                    </Link>
                  </div>
                );
```

- [ ] **Step 5: Run tests, type check, lint**

Run: `pixi run test-frontend -- ngViewsColumns && pixi run node-check && pixi run node-prettier-write && pixi run node-eslint-check`
Expected: tests PASS; node-check at the known baseline; no eslint errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/queries/viewQueries.ts frontend/src/components/ui/Table/ngViewsColumns.tsx frontend/src/__tests__/componentTests/ngViewsColumns.test.tsx
git commit -m "feat(views): keep broken sources in the Views table with a broken-link icon

Sources now come from layer.fsp_name/path instead of a lookup through the
user's Data Links, so a deleted link no longer erases the source line."
```

---

### Task 5: Delete dialog shows dependent Views immediately (one click)

**Files:**
- Modify: `frontend/src/components/ui/Dialogs/DataLink.tsx:197-199, 355-415`
- Test: `frontend/src/__tests__/componentTests/DataLinkDeleteDependentViews.test.tsx`
- Test: `frontend/ui-tests/tests/data-link-operations.spec.ts` (dependent-Views flow)

**Interfaces:**
- Consumes: `useViewsForDataLinkQuery(sharingKey?: string)` from `@/queries/viewQueries`.

- [ ] **Step 1: Rewrite the component test**

Replace the body of `lists dependent Views on 409 and confirms with confirm=true` in `DataLinkDeleteDependentViews.test.tsx` with two tests. Keep the existing context mocks; add a mock for the query:

```ts
const viewsForDataLink = vi.hoisted(() => vi.fn());
vi.mock('@/queries/viewQueries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/queries/viewQueries')>()),
  useViewsForDataLinkQuery: viewsForDataLink
}));
```

```ts
it('shows dependent Views as soon as the dialog opens and deletes with confirm on one click', async () => {
  viewsForDataLink.mockReturnValue({
    data: [{ short_key: 'v1', name: 'My overlay' }],
    isPending: false
  });
  const handleDeleteDataLink = vi.fn().mockResolvedValue(undefined);
  renderDeleteDialog({ handleDeleteDataLink }); // the file's existing render helper
  expect(await screen.findByText('My overlay')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(handleDeleteDataLink).toHaveBeenCalledWith(expect.anything(), true);
  expect(screen.queryByText('Delete anyway')).not.toBeInTheDocument();
});

it('deletes without confirm when there are no dependent Views', async () => {
  viewsForDataLink.mockReturnValue({ data: [], isPending: false });
  const handleDeleteDataLink = vi.fn().mockResolvedValue(undefined);
  renderDeleteDialog({ handleDeleteDataLink });
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(handleDeleteDataLink).toHaveBeenCalledWith(expect.anything(), false);
});
```

Keep one test for the race fallback (the current 409 path): mock the query to return `[]`, make `handleDeleteDataLink` reject with `new DependentViewsError(...)` on the first call, and assert the list appears and the second click calls with `true`.

- [ ] **Step 2: Run to confirm failure**

Run: `pixi run test-frontend -- DataLinkDeleteDependentViews`
Expected: the first new test FAILS (dialog does not list Views before a click).

- [ ] **Step 3: Pre-fetch and confirm on the first click**

In `DataLink.tsx`:

1. Import: `import { useViewsForDataLinkQuery } from '@/queries/viewQueries';`
2. Next to the `dependentViews` state (line ~197) add:

```ts
  // Pre-fetch dependent Views so the warning is visible on open and the
  // delete is a single confirming click. `dependentViews` (set from a 409)
  // remains as the fallback for a View created between fetch and click.
  const dependentViewsQuery = useViewsForDataLinkQuery(
    props.action === 'delete' ? props.proxiedPath.sharing_key : undefined
  );
  const knownDependents =
    dependentViews ??
    (dependentViewsQuery.data ?? []).map(v => ({
      short_key: v.short_key,
      name: v.name
    }));
```

3. In the delete branch, replace `dependentViews && dependentViews.length > 0 ? (` with `knownDependents.length > 0 ? (` and map over `knownDependents`. Restyle the block:

```tsx
              <div className="flex flex-col gap-2 border-l-4 border-warning bg-surface/30 p-3 rounded">
                <Typography className="text-warning font-semibold">
                  These Views you own use this data link and will be marked
                  broken:
                </Typography>
```

4. Replace the button `onClick` with a single path:

```tsx
                onClick={async () => {
                  try {
                    await props.handleDeleteDataLink(
                      props.proxiedPath,
                      knownDependents.length > 0
                    );
                    props.setShowDataLinkDialog(false);
                  } catch (error) {
                    if (error instanceof DependentViewsError) {
                      setDependentViews(error.views);
                    }
                    // other errors are already toasted in handleDeleteDataLink
                  }
                }}
```

and set the label to a constant `Delete` (remove the `'Delete anyway'` ternary).

- [ ] **Step 4: Run tests, type check, lint**

Run: `pixi run test-frontend -- "DataLink" && pixi run node-check && pixi run node-prettier-write && pixi run node-eslint-check`
Expected: PASS.

- [ ] **Step 5: Update the Playwright flow**

In `frontend/ui-tests/tests/data-link-operations.spec.ts`, find the test that deletes a Data Link backing a View (it clicks Delete, then `Delete anyway`). Change it to: open the delete dialog, `await expect(dialog.getByText(/will be marked broken/)).toBeVisible()`, click the dialog's `Delete` once, then assert the link is gone. Remove the `Delete anyway` click.

Run: `pixi run test-ui -- tests/data-link-operations.spec.ts`
Expected: PASS. If the Playwright browsers are not installed, run `cd frontend/ui-tests && pixi run npx playwright install` first.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/Dialogs/DataLink.tsx frontend/src/__tests__/componentTests/DataLinkDeleteDependentViews.test.tsx frontend/ui-tests/tests/data-link-operations.spec.ts
git commit -m "feat(views): show dependent Views up front in the Data Link delete dialog

Pre-fetch with useViewsForDataLinkQuery so the warning renders on open and
one click deletes with confirm. The 409 path stays as a race fallback."
```

---

### Task 6: Full-suite verification and PR

- [ ] **Step 1: Run everything**

```bash
pixi run -e test test-backend
pixi run test-frontend
pixi run node-check
pixi run node-prettier-check
pixi run node-eslint-check
```
Expected: backend and frontend suites green; node-check at the known 5-error baseline; prettier and eslint clean.

- [ ] **Step 2: Push and open the stacked draft PR**

Follow the `gh-stack` skill. Base: `ngviews-07-cart-and-viewer-polish`. Title: `feat(views): track broken sources; fix Postgres dependent-Views query`. Body lists items 1–4 from the spec and the manual dev verification step (delete a Data Link that backs a View on Postgres).
