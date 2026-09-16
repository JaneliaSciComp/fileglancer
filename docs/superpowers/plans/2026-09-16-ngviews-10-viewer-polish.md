# ngviews-10 Viewer Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner rename a View from inside the embedded viewer, and align the viewer and Views-table copy around "View" and "share".

**Architecture:** Frontend only. Generalise the jobs-page `JobTitleEditor` into an `InlineNameEditor` widget and reuse it in `NeuroglancerView`, which finds its own View (and therefore ownership, name and `short_key`) by matching `read_key` in the cached owner Views list. Copy changes are string and icon swaps with test updates.

**Tech Stack:** React 18, TanStack Query v5, react-icons, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-16-ngviews-dev-feedback-design.md` (Branch 10 section).

## Global Constraints

- Always run tools through pixi.
- Branch: `git checkout -b ngviews-10-viewer-polish ngviews-09-cart-ux`.
- Copy: "Open View", "Copy View link to share", "Copy link to share", toast "View link copied". Never "NG View" or "Neuroglancer link".
- Run `pixi run node-prettier-write` and `pixi run node-eslint-check` before each commit.

---

### Task 1: Views table actions copy

**Files:**
- Modify: `frontend/src/components/ui/Table/ngViewsColumns.tsx:53-70`
- Test: `frontend/src/__tests__/componentTests/ngViewsColumns.test.tsx:168-185`

- [ ] **Step 1: Update the tests**

In `ngViewsColumns.test.tsx`, rename the test to `navigates to the embedded viewer when "Open View" is clicked` and change `findByText('Open in Neuroglancer')` to `findByText('Open View')`. Add:

```ts
it('copies the link under "Copy View link to share" and toasts "View link copied"', async () => {
  const user = userEvent.setup();
  renderTable();
  await user.click(screen.getAllByRole('button', { name: /actions/i })[0]);
  await user.click(await screen.findByText('Copy View link to share'));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('View link copied'));
});
```

Adapt the menu-opening step to how the existing `fires onRename and onDelete` test opens the menu, and check the file already mocks `@/utils/copyText` (add `vi.mock('@/utils/copyText', () => ({ copyToClipboard: vi.fn().mockResolvedValue({ success: true }) }))` if not).

- [ ] **Step 2: Run to confirm failure**

Run: `pixi run test-frontend -- ngViewsColumns`
Expected: FAIL (old strings).

- [ ] **Step 3: Change the strings**

In `ngViewsColumns.tsx` `ActionsCell`:

```ts
    {
      name: 'Open View',
      ...
    },
    {
      name: 'Copy View link to share',
      action: async ({ item, baseUrl }) => {
        const result = await copyToClipboard(
          constructNeuroglancerUrl(item.ng_state, baseUrl)
        );
        if (result.success) {
          toast.success('View link copied');
        } else {
          toast.error(`Failed to copy: ${result.error}`);
        }
      }
    },
```

- [ ] **Step 4: Run tests**

Run: `pixi run test-frontend -- ngViewsColumns`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/Table/ngViewsColumns.tsx frontend/src/__tests__/componentTests/ngViewsColumns.test.tsx
git commit -m "chore(views): rename row actions to Open View / Copy View link to share"
```

---

### Task 2: Share icon and tooltip in the embedded viewer

**Files:**
- Modify: `frontend/src/components/NeuroglancerView.tsx:6-11, 86-94, 133-137`
- Test: `frontend/src/__tests__/componentTests/NeuroglancerView.test.tsx:118`

- [ ] **Step 1: Update the test**

Rename the copy test to `copies the canonical short link ... when "Copy link to share" is clicked`, change `getByRole('button', { name: 'Copy link' })` (or `getByLabelText`) to `'Copy link to share'`, and add an assertion `expect(toast.success).toHaveBeenCalledWith('View link copied')` (mock `react-hot-toast` if the file does not already).

- [ ] **Step 2: Run to confirm failure**

Run: `pixi run test-frontend -- NeuroglancerView`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `NeuroglancerView.tsx`: replace `HiOutlineDuplicate` with `HiOutlineShare` in the `react-icons/hi` import and in the toolbar; change the label to `"Copy link to share"`; change the success toast to `toast.success('View link copied')`.

- [ ] **Step 4: Run tests**

Run: `pixi run test-frontend -- NeuroglancerView`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/NeuroglancerView.tsx frontend/src/__tests__/componentTests/NeuroglancerView.test.tsx
git commit -m "chore(views): share icon and 'Copy link to share' tooltip in the embedded viewer"
```

---

### Task 3: Extract `InlineNameEditor` from `JobTitleEditor`

**Files:**
- Create: `frontend/src/components/ui/widgets/InlineNameEditor.tsx`
- Modify: `frontend/src/components/ui/AppsPage/JobTitleEditor.tsx`
- Test: `frontend/src/__tests__/componentTests/InlineNameEditor.test.tsx` (create); existing job-title tests (grep `frontend/src/__tests__` for `JobTitleEditor` or `Edit job name`) must keep passing unchanged.

**Interfaces:**
- Produces:
  ```ts
  type InlineNameEditorProps = {
    readonly value: string;          // current display name
    readonly label: string;          // noun for aria labels/tooltips, e.g. 'job name', 'view name'
    readonly onSave: (name: string) => Promise<void>; // resolves on success; reject to keep editing
    readonly className?: string;     // applied to the read-mode Typography
    readonly typographyType?: 'h6' | 'lead' | 'paragraph'; // Material Tailwind Typography `type`, default 'h6'
  };
  export default function InlineNameEditor(props: InlineNameEditorProps): JSX.Element;
  ```
  Behaviour: pencil icon (`aria-label` = `Edit ${label}`) enters edit mode with the input focused; Enter or the check button (`aria-label` = `Save ${label}`) calls `onSave(trimmed)` and exits edit mode when it resolves; Escape or the x button (`aria-label` = `Cancel rename`) exits without saving; empty/whitespace names disable Save.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InlineNameEditor from '@/components/ui/widgets/InlineNameEditor';

describe('InlineNameEditor', () => {
  it('shows the name and saves an edited name on Enter', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineNameEditor label="view name" onSave={onSave} value="Old" />);
    expect(screen.getByText('Old')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Edit view name'));
    const input = screen.getByRole('textbox');
    expect(input).toHaveFocus();
    await userEvent.clear(input);
    await userEvent.type(input, 'New{Enter}');
    expect(onSave).toHaveBeenCalledWith('New');
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
  });

  it('cancels on Escape without saving', async () => {
    const onSave = vi.fn();
    render(<InlineNameEditor label="view name" onSave={onSave} value="Old" />);
    await userEvent.click(screen.getByLabelText('Edit view name'));
    await userEvent.type(screen.getByRole('textbox'), 'x{Escape}');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Old')).toBeInTheDocument();
  });

  it('stays in edit mode when save rejects', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('nope'));
    render(<InlineNameEditor label="view name" onSave={onSave} value="Old" />);
    await userEvent.click(screen.getByLabelText('Edit view name'));
    await userEvent.click(screen.getByLabelText('Save view name'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pixi run test-frontend -- InlineNameEditor`
Expected: FAIL (module not found).

- [ ] **Step 3: Create the widget**

`frontend/src/components/ui/widgets/InlineNameEditor.tsx`:

```tsx
import { useState } from 'react';
import { IconButton, Typography } from '@material-tailwind/react';
import { HiOutlinePencilSquare } from 'react-icons/hi2';
import { HiOutlineCheck, HiOutlineX } from 'react-icons/hi';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import FgTooltip from '@/components/ui/widgets/FgTooltip';

type InlineNameEditorProps = {
  readonly value: string;
  readonly label: string;
  readonly onSave: (name: string) => Promise<void>;
  readonly className?: string;
  readonly typographyType?: 'h6' | 'lead' | 'paragraph';
};

// Read-mode name with a pencil that swaps in an input + save/cancel. The
// caller owns the mutation and its toasts; reject from onSave to stay in
// edit mode.
export default function InlineNameEditor({
  value,
  label,
  onSave,
  className = 'text-foreground font-bold truncate',
  typographyType = 'h6'
}: InlineNameEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
  };

  const save = async () => {
    const name = draft.trim();
    if (!name) {
      return;
    }
    setSaving(true);
    try {
      await onSave(name);
      setEditing(false);
    } catch {
      // caller toasts; stay in edit mode
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <Typography className={className} type={typographyType}>
          {value}
        </Typography>
        <FgTooltip label={`Edit ${label}`}>
          <IconButton
            aria-label={`Edit ${label}`}
            className="text-foreground hover:text-primary flex-shrink-0"
            onClick={startEdit}
            size="sm"
            variant="ghost"
          >
            <FgIcon icon={HiOutlinePencilSquare} />
          </IconButton>
        </FgTooltip>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <FgInput
        autoFocus
        className="min-w-64"
        disabled={saving}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            void save();
          } else if (e.key === 'Escape') {
            setEditing(false);
          }
        }}
        type="text"
        value={draft}
      />
      <FgTooltip label="Save">
        <IconButton
          aria-label={`Save ${label}`}
          className="text-foreground hover:text-primary flex-shrink-0"
          disabled={!draft.trim() || saving}
          onClick={() => void save()}
          size="sm"
          variant="ghost"
        >
          <FgIcon icon={HiOutlineCheck} />
        </IconButton>
      </FgTooltip>
      <FgTooltip label="Cancel">
        <IconButton
          aria-label="Cancel rename"
          className="text-foreground hover:text-primary flex-shrink-0"
          onClick={() => setEditing(false)}
          size="sm"
          variant="ghost"
        >
          <FgIcon icon={HiOutlineX} />
        </IconButton>
      </FgTooltip>
    </div>
  );
}
```

- [ ] **Step 4: Make `JobTitleEditor` a thin wrapper**

Replace the file body with:

```tsx
import toast from 'react-hot-toast';

import InlineNameEditor from '@/components/ui/widgets/InlineNameEditor';
import { showErrorToast } from '@/utils/errorToast';
import { useUpdateJobMutation } from '@/queries/jobsQueries';
import type { Job } from '@/shared.types';

export default function JobTitleEditor({ job }: { readonly job: Job }) {
  const displayName = job.name || `${job.app_name} - ${job.entry_point_name}`;
  const updateJobMutation = useUpdateJobMutation();

  return (
    <InlineNameEditor
      label="job name"
      onSave={async name => {
        try {
          await updateJobMutation.mutateAsync({ jobId: job.id, name });
          toast.success('Job renamed');
        } catch (error) {
          showErrorToast(error, 'Failed to rename job');
          throw error;
        }
      }}
      value={displayName}
    />
  );
}
```

The aria labels (`Edit job name`, `Save job name`, `Cancel rename`) are unchanged, so existing job tests keep passing.

- [ ] **Step 5: Run tests, type check, lint**

Run: `pixi run test-frontend -- "InlineNameEditor|JobTitle|ListingDetail|AppJobs" && pixi run node-check && pixi run node-prettier-write && pixi run node-eslint-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/widgets/InlineNameEditor.tsx frontend/src/components/ui/AppsPage/JobTitleEditor.tsx frontend/src/__tests__/componentTests/InlineNameEditor.test.tsx
git commit -m "refactor(ui): extract InlineNameEditor from JobTitleEditor"
```

---

### Task 4: Rename the View from the embedded viewer

**Files:**
- Modify: `frontend/src/components/NeuroglancerView.tsx`
- Test: `frontend/src/__tests__/componentTests/NeuroglancerView.test.tsx`

**Interfaces:**
- Consumes: `InlineNameEditor` (Task 3); `useViewsQuery()` from `@/queries/viewQueries`; `useViewsContext().updateViewMutation` (mutateAsync `{ short_key, name }`).

- [ ] **Step 1: Update the test mocks and add tests**

In `NeuroglancerView.test.tsx`, extend the `viewQueries` mock and add a `ViewsContext` mock:

```ts
const useViewsQuery = vi.hoisted(() => vi.fn(() => ({ data: [] })));
const mutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/queries/viewQueries', () => ({ useViewStateByReadKey, useViewsQuery }));
vi.mock('@/contexts/ViewsContext', () => ({
  useViewsContext: () => ({ updateViewMutation: { mutateAsync } })
}));
```

Add tests (adapt `useParams` mock so `readKey` is `'rk1'`):

```ts
it('shows the owned View name with a rename control', async () => {
  useViewsQuery.mockReturnValue({
    data: [{ short_key: 'sk1', read_key: 'rk1', name: 'Mine', ng_state: {}, sharing_mode: 'read', owner: 'me', created_at: '', updated_at: '', layers: [] }]
  });
  renderViewer();
  expect(await screen.findByText('Mine')).toBeInTheDocument();
  await userEvent.click(screen.getByLabelText('Edit view name'));
  await userEvent.clear(screen.getByRole('textbox'));
  await userEvent.type(screen.getByRole('textbox'), 'Renamed{Enter}');
  expect(mutateAsync).toHaveBeenCalledWith({ short_key: 'sk1', name: 'Renamed' });
});

it('shows a read-only title without a rename control when the View is not owned', () => {
  useViewsQuery.mockReturnValue({ data: [] });
  renderViewer({ title: 'Theirs' });
  expect(screen.getByText('Theirs')).toBeInTheDocument();
  expect(screen.queryByLabelText('Edit view name')).not.toBeInTheDocument();
});
```

Keep the existing `falls back to "Untitled View"` test (owned view absent, no `title` in state).

- [ ] **Step 2: Run to confirm failure**

Run: `pixi run test-frontend -- NeuroglancerView`
Expected: FAIL (`Edit view name` not found).

- [ ] **Step 3: Implement**

In `NeuroglancerView.tsx`:

```ts
import { useViewStateByReadKey, useViewsQuery } from '@/queries/viewQueries';
import { useViewsContext } from '@/contexts/ViewsContext';
import InlineNameEditor from '@/components/ui/widgets/InlineNameEditor';
```

Inside the component, after `stateQuery`:

```ts
  // The public read_key endpoint returns only ng_state. Ownership, name and
  // short_key come from the owner's own Views list (cached app-wide); a miss
  // means "not mine" and the title renders read-only.
  const viewsQuery = useViewsQuery();
  const ownedView = viewsQuery.data?.find(v => v.read_key === readKey);
  const { updateViewMutation } = useViewsContext();
```

Replace the `title` line with:

```ts
  const title =
    ownedView?.name || (ngState.title as string) || 'Untitled View';
```

Replace `<Typography className="truncate">{title}</Typography>` in the breadcrumb with:

```tsx
            {ownedView ? (
              <InlineNameEditor
                className="text-foreground truncate"
                label="view name"
                onSave={async name => {
                  try {
                    await updateViewMutation.mutateAsync({
                      short_key: ownedView.short_key,
                      name
                    });
                    toast.success('View renamed');
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : 'Rename failed'
                    );
                    throw error;
                  }
                }}
                typographyType="paragraph"
                value={title}
              />
            ) : (
              <Typography className="truncate">{title}</Typography>
            )}
```

Note `useViewsQuery`'s hook must be called unconditionally, before the early `isPending`/`isError` returns.

- [ ] **Step 4: Run tests, type check, lint**

Run: `pixi run test-frontend -- NeuroglancerView && pixi run node-check && pixi run node-prettier-write && pixi run node-eslint-check`
Expected: PASS.

- [ ] **Step 5: Manual check**

Run `pixi run dev-launch` + `pixi run dev-watch`, open a View you own at `/view/<read_key>`, rename it, confirm the breadcrumb updates and the Views table shows the new name (`useUpdateViewMutation` already invalidates the list).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/NeuroglancerView.tsx frontend/src/__tests__/componentTests/NeuroglancerView.test.tsx
git commit -m "feat(views): rename an owned View from the embedded viewer"
```

---

### Task 5: Full-suite verification and PR

- [ ] **Step 1: Run everything**

```bash
pixi run test-frontend
pixi run node-check
pixi run node-prettier-check
pixi run node-eslint-check
pixi run test-ui
```
Expected: green; node-check at the known baseline; grep `frontend/ui-tests/tests` for "Open in Neuroglancer" / "Copy Neuroglancer link" / "Copy link" and update any hits.

- [ ] **Step 2: Push and open the stacked draft PR**

Base: `ngviews-09-cart-ux`. Title: `feat(views): inline rename in the embedded viewer; View/share copy`. Body lists items 10, 12, 13.
