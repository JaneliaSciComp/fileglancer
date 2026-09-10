# Neuroglancer Views — PR 3 (`ngviews-03-multiselect`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select to the file browser — row checkboxes + a header "select all" — as a **purely additive** selection set, the foundation the floating selection bar and Layer Cart (PR 5) build on.

**Architecture:** Add a new `checkedPaths: Set<string>` (keyed on file `path`) to `FileBrowserContext`, independent of the existing single-select `selectedFiles`/`propertiesTarget`. Row clicks keep their current single-select behavior (which the Properties drawer, all dialogs, and data-links depend on); **checkboxes** drive the new set. A leading checkbox column is prepended to the TanStack table. The checked set resets per-directory by reusing the context's existing navigation reset effect.

**Tech Stack:** React 18, TypeScript, TanStack Table v8 + Virtual, Material Tailwind v3 (`FgCheckbox`), Vitest + React Testing Library. All commands run through **pixi**.

## Global Constraints

- **Always use pixi.** Frontend tests: `pixi run test-frontend`. Type check: `pixi run node-check`. Lint: `pixi run node-eslint-check` (autofix `node-eslint-write`).
- **Branch:** all commits land on `ngviews-03-multiselect`, branched off **`ngviews-02-api`** (stacked PR 3; base is PR 2). Create it first: `git checkout ngviews-02-api && git checkout -b ngviews-03-multiselect`.
- **Purely additive — do NOT change** `selectedFiles`, `propertiesTarget`, `dataLinkPath`, `handleLeftClick`, `updateFilesWithContextMenuClick`, or `clearSelection`. Every downstream consumer (Properties drawer, Delete/Rename/ChangePermissions/Convert dialogs, DataToolLinks, favorites, tickets) reads those and must keep working unchanged.
- **Key the checked set on `path`** (unique, stable), not `name`.
- **Frontend conventions** (`frontend/CLAUDE.md`): separate value/type imports; use the house `FgCheckbox`; no `console.log` (use `src/logger.ts`); PascalCase components; named React imports; define props interfaces; don't specify component return types.
- **Row checkbox clicks must `e.stopPropagation()`** so they don't also trigger the row's `onClick` (single-select `handleLeftClick`) — mirror the existing `⋯` actions cell (`FileTable.tsx:197-200`).

**Interfaces this PR produces (consumed by PR 5):**
- `fileBrowserState.checkedPaths: Set<string>` and `fileBrowserState.checkedFiles: FileOrFolder[]` (derived from the current listing).
- `toggleChecked(path: string): void`, `checkPaths(paths: string[]): void`, `clearChecked(): void`.

---

### Task 1: `FileBrowserContext` — the checked-paths set + actions

**Files:**
- Modify: `frontend/src/contexts/FileBrowserContext.tsx`
- Test: `frontend/src/__tests__/componentTests/FileBrowserMultiSelect.test.tsx` (new)

**Interfaces:**
- Consumes: existing `fileQuery` (`fileQuery.data?.files: FileOrFolder[]`), `useState`, `useCallback`, `useMemo` (all imported), `FileOrFolder`.
- Produces: on `fileBrowserState` — `checkedPaths: Set<string>`, `checkedFiles: FileOrFolder[]`; on the context — `toggleChecked(path)`, `checkPaths(paths)`, `clearChecked()`. Note: `clearChecked` is NEW and distinct from the existing `clearSelection` (which clears the single-select).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/componentTests/FileBrowserMultiSelect.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { render } from '../test-utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

function Probe() {
  const { fileBrowserState, toggleChecked, checkPaths, clearChecked } =
    useFileBrowserContext();
  return (
    <div>
      <span data-testid="count">{fileBrowserState.checkedPaths.size}</span>
      <button onClick={() => toggleChecked('/dir/a.txt')}>toggle-a</button>
      <button onClick={() => checkPaths(['/dir/a.txt', '/dir/b.txt'])}>
        check-two
      </button>
      <button onClick={() => clearChecked()}>clear</button>
    </div>
  );
}

describe('FileBrowser multi-select checked set', () => {
  it('toggles, unions, and clears checked paths (independent of the network)', async () => {
    const user = userEvent.setup();
    render(<Probe />, { initialEntries: ['/browse/myFsp/dir'] });
    const count = () => screen.getByTestId('count').textContent;

    expect(count()).toBe('0');
    await user.click(screen.getByText('toggle-a'));
    expect(count()).toBe('1'); // added
    await user.click(screen.getByText('toggle-a'));
    expect(count()).toBe('0'); // toggled off
    await user.click(screen.getByText('check-two'));
    expect(count()).toBe('2'); // union
    await user.click(screen.getByText('check-two'));
    expect(count()).toBe('2'); // union is idempotent (no duplicates)
    await user.click(screen.getByText('clear'));
    expect(count()).toBe('0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pixi run test-frontend -- FileBrowserMultiSelect`
Expected: FAIL — `toggleChecked`/`checkPaths`/`clearChecked` and `fileBrowserState.checkedPaths` don't exist (TypeError / undefined).

- [ ] **Step 3: Add the checked-set state and actions**

In `frontend/src/contexts/FileBrowserContext.tsx`:

(a) Add the state right after the existing `internalState` `useState` (after line 115):

```tsx
  // Multi-select set (independent of single-select). Keyed on file path.
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set());
```

(b) Add the actions after `updateInternalState` (after line 135):

```tsx
  const toggleChecked = useCallback((path: string) => {
    setCheckedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const checkPaths = useCallback((paths: string[]) => {
    setCheckedPaths(prev => new Set([...prev, ...paths]));
  }, []);

  const clearChecked = useCallback(() => {
    setCheckedPaths(new Set());
  }, []);
```

(c) Reset the checked set on directory navigation — inside the existing nav `useEffect` `else` branch (after the `setInternalState({...})` call at lines 188-193), add:

```tsx
        setCheckedPaths(new Set());
```

(d) Derive `checkedFiles` from the current listing — add near the `dataLinkPath` memo (after line 290):

```tsx
  const checkedFiles = useMemo(
    () => (fileQuery.data?.files ?? []).filter(f => checkedPaths.has(f.path)),
    [fileQuery.data?.files, checkedPaths]
  );
```

(d) Extend the `FileBrowserState` type (lines 28-32):

```tsx
type FileBrowserState = {
  propertiesTarget: FileOrFolder | null;
  selectedFiles: FileOrFolder[];
  dataLinkPath: string | null;
  checkedPaths: Set<string>;
  checkedFiles: FileOrFolder[];
};
```

(e) Extend the `FileBrowserContextType` (in the Actions section, after line 87):

```tsx
  toggleChecked: (path: string) => void;
  checkPaths: (paths: string[]) => void;
  clearChecked: () => void;
```

(f) Add the new fields/actions to the provider value — extend the `fileBrowserState` object literal (lines 295-299) and the actions block (lines 321-324):

```tsx
        fileBrowserState: {
          propertiesTarget,
          selectedFiles: internalState.selectedFiles,
          dataLinkPath,
          checkedPaths,
          checkedFiles
        },
```
```tsx
        // Actions
        handleLeftClick,
        updateFilesWithContextMenuClick,
        clearSelection,
        toggleChecked,
        checkPaths,
        clearChecked
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pixi run test-frontend -- FileBrowserMultiSelect`
Expected: PASS.

- [ ] **Step 5: Type-check and lint**

Run: `pixi run node-check` then `pixi run node-eslint-check`
Expected: no new errors. (If eslint flags formatting, `pixi run node-eslint-write`.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/contexts/FileBrowserContext.tsx frontend/src/__tests__/componentTests/FileBrowserMultiSelect.test.tsx
git commit -m "feat(browse): add additive checked-paths multi-select set to FileBrowserContext"
```

---

### Task 2: `FileTable` — the checkbox column

**Files:**
- Modify: `frontend/src/components/ui/BrowsePage/FileTable.tsx`
- Test: `frontend/src/__tests__/componentTests/FileTableSelectColumn.test.tsx` (new)

**Interfaces:**
- Consumes Task 1's `fileBrowserState.checkedPaths`, `toggleChecked`, `checkPaths`, `clearChecked`; the `data: FileOrFolder[]` prop; `FgCheckbox`.
- Produces: a leading `select` column (header "select all" + per-row checkbox). No new exported interface.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/componentTests/FileTableSelectColumn.test.tsx`. It renders the full Browse page through the shared harness (same setup `Browse.test.tsx` uses — read that file for the exact MSW file-listing handler and mirror it so a directory listing loads), then asserts the header "Select all" checkbox is present and toggles. The header row is NOT virtualized, so this assertion is robust in jsdom even if virtualized data rows don't mount.

```tsx
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { render } from '../test-utils';
import Browse from '@/components/Browse';

// NOTE: mirror Browse.test.tsx's MSW handler for GET /api/files/:fspName so a
// listing with at least one file loads. Import/copy that handler setup here.

describe('FileTable select column', () => {
  it('renders a "Select all" header checkbox that toggles on click', async () => {
    const user = userEvent.setup();
    render(<Browse />, { initialEntries: ['/browse/myFsp/dir'] });

    const selectAll = await screen.findByRole('checkbox', {
      name: /select all/i
    });
    expect(selectAll).not.toBeChecked();

    await user.click(selectAll);
    await waitFor(() => expect(selectAll).toBeChecked());

    await user.click(selectAll);
    await waitFor(() => expect(selectAll).not.toBeChecked());
  });
});
```

If the shared harness makes rendering the whole `Browse` awkward, fall back to rendering `Table` directly wrapped in `<MemoryRouter>` with `vi.mock('@/contexts/FileBrowserContext', ...)` returning a minimal context (`fileBrowserState: { checkedPaths: new Set(), checkedFiles: [], selectedFiles: [], propertiesTarget: null, dataLinkPath: null }`, `checkPaths`/`clearChecked`/`toggleChecked` as `vi.fn()`, `handleLeftClick: vi.fn()`, `fetchNextPage: vi.fn()`, `hasNextPage: false`, `isFetchingNextPage: false`, `fileQuery: { data: { currentFileSharePath: { name: 'myFsp' }, isTruncated: false } }`), `data` = two `FileOrFolder` objects, and assert the header checkbox renders and clicking it calls `checkPaths` with both paths. Use whichever is less brittle in this repo — the assertion (header select-all exists + toggles) is what matters.

- [ ] **Step 2: Run test to verify it fails**

Run: `pixi run test-frontend -- FileTableSelectColumn`
Expected: FAIL — no "Select all" checkbox yet.

- [ ] **Step 3: Add the checkbox column**

In `frontend/src/components/ui/BrowsePage/FileTable.tsx`:

(a) Add the import (with the other design-system atom imports, near line 23):

```tsx
import FgCheckbox from '@/components/designSystem/atoms/formElements/FgCheckbox';
```

(b) Pull the new context members into the existing destructure (lines 73-80):

```tsx
  const {
    fileQuery,
    fileBrowserState,
    handleLeftClick,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    toggleChecked,
    checkPaths,
    clearChecked
  } = useFileBrowserContext();
  const checkedPaths = fileBrowserState.checkedPaths;
```

(c) Prepend the `select` column as the first entry in the `columns` `useMemo` array (before the `name` column at line 120):

```tsx
      {
        id: 'select',
        header: () => {
          const allChecked =
            data.length > 0 && data.every(f => checkedPaths.has(f.path));
          return (
            <FgCheckbox
              checked={allChecked}
              hideLabel
              label="Select all"
              onChange={() =>
                allChecked ? clearChecked() : checkPaths(data.map(f => f.path))
              }
              onClick={e => e.stopPropagation()}
            />
          );
        },
        cell: ({ row }) => {
          const file = row.original;
          return (
            <FgCheckbox
              checked={checkedPaths.has(file.path)}
              hideLabel
              label={`Select ${file.name}`}
              onChange={() => toggleChecked(file.path)}
              onClick={e => e.stopPropagation()}
            />
          );
        },
        size: 44,
        minSize: 44,
        enableSorting: false,
        enableResizing: false
      },
```

(d) Add the new dependencies to the `columns` `useMemo` deps array (line 216). It becomes:

```tsx
    [
      fileQuery.data?.currentFileSharePath,
      handleContextMenuClick,
      data,
      checkedPaths,
      toggleChecked,
      checkPaths,
      clearChecked
    ]
```

`// ponytail: columns rebuild on each check toggle (checkedPaths in deps). Fine for typical dir sizes; move check state into TanStack table `meta` if a huge-listing perf issue shows up.`

- [ ] **Step 4: Run test to verify it passes**

Run: `pixi run test-frontend -- FileTableSelectColumn`
Expected: PASS.

- [ ] **Step 5: Type-check, lint, and full frontend suite**

Run: `pixi run node-check`, then `pixi run node-eslint-check`, then `pixi run test-frontend`
Expected: no new type/lint errors; full suite green (existing FileBrowser/Browse tests still pass — the additive column and context fields don't change single-select behavior).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/BrowsePage/FileTable.tsx frontend/src/__tests__/componentTests/FileTableSelectColumn.test.tsx
git commit -m "feat(browse): add row + select-all checkbox column to the file table"
```

---

## Self-Review

**Spec coverage:** PR 3 per spec §6 ("Multi-select is net-new in `FileTable`/`FileBrowserContext`: row checkboxes, a header select-all, a selection set. Foundation for the selection bar and cart.") — checked set + actions ✓ (Task 1), row + select-all checkbox column ✓ (Task 2), keyed on `path` ✓, reset per-directory ✓ (Task 1c), single-select untouched ✓ (no edits to `handleLeftClick`/`propertiesTarget`/dialogs).

**Placeholder scan:** none — concrete code for every step. Task 2's test names the fallback explicitly (mock-context render) rather than leaving the approach open; both paths assert the same behavior.

**Type consistency:** `checkedPaths: Set<string>`, `checkedFiles: FileOrFolder[]`, `toggleChecked(path: string)`, `checkPaths(paths: string[])`, `clearChecked()` are identical in the context type (Task 1e), the provider value (Task 1f), and the FileTable consumption (Task 2b). `clearChecked` is distinct from the pre-existing `clearSelection`.

**Ambiguity check:** the checked set (checkboxes) and the focused file (`propertiesTarget`, row click) are deliberately separate concepts; a row body click still drives Properties, a checkbox click (with `stopPropagation`) only toggles the set. Select-all keys off the `data` prop (what's rendered), so it stays consistent with the header's `allChecked` computation.

## Out of scope for this PR (next plans)

- PR 4 `ngviews-04-views-page`: the Views page + `ViewsContext` + `CartContext` + nav rename.
- PR 5 `ngviews-05-browser-entry`: the floating selection bar, right-edge rail (Properties ↔ Cart), cart drawer, row `⋯` items, consent, "Appears in N Views", Data Link delete dialog — **all consume `checkedFiles`/`checkedPaths` from this PR**.
- PR 6 `ngviews-06-embedded-readonly`: the read-only embedded viewer.
