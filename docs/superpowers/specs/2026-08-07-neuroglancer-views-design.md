# Neuroglancer Views — design spec

Status: **approved for implementation (read-only scope)**
Date: 2026-08-07
Source material: `.scratch/neuroglancer-views/` (decision log + wireframes),
`docs/adr/0001-neuroglancer-views.md`, `CONTEXT.md` (glossary).

## 1. Summary

A **Neuroglancer View** becomes a first-class saved object: a Neuroglancer
state + the datasets it shows (a many-to-many relationship) + sharing settings.
Views open **embedded inside Fileglancer** in an iframe. A plain Neuroglancer
link becomes a one-shot **export** of a View, not a separately persisted record.
Views are built two ways — a **Layer Cart** (collect datasets/channels while
browsing, then check out) and, in a later stack, an **In-View Data Panel**.

This spec covers the **read-only** scope. Editable Views (an edit link whose
changes persist for everyone) are explicitly deferred to a follow-up stack; the
data model reserves space for them but no edit behavior is built here.

Delivery is a `gh stack` of six bottom-up PRs (§6).

## 2. Scope

### In scope (read-only)

- `views` + `view_layers` tables and one Alembic migration (additive).
- Views CRUD API (owner-scoped): create, list, get, rename, delete.
- Read-link access: `GET /ngview/{key}` serves a View's state to the NG iframe.
- Layer Cart (server-side, per-user) + checkout → creates a View.
- File-browser entry points: multi-select, row `⋯` items, floating selection
  bar, right-edge icon rail (Properties ↔ Cart), cart drawer, count badges.
- Data-link consent reuse for any View-creating action.
- Bidirectional discovery: dataset → Views (Properties drawer) and
  View → datasets (Views page / layer list).
- Data Link deletion guard with a dependent-Views resolution dialog.
- Read-only embedded viewer: iframe + state + Export menu + Fullscreen +
  scratch View → "Save as View".
- Three one-shot exports: Copy Neuroglancer link · Download JSON state ·
  Open in external Neuroglancer.

### Out of scope (deferred to the editable-Views stack)

- The **edit link**, persist-on-change, and the amber "changes save for
  everyone" banner.
- The **In-View Data Panel** (live browse-and-add that mutates a saved View).
- `sharing_mode: read_edit` and the two-link Share UI.

### Out of scope (other)

- Migrating existing `neuroglancer_states` / `/nglinks` short links into Views
  (a later cleanup stack). Legacy short links keep working; the nav entry is
  repointed and `/nglinks` redirects to `/ngviews`.
- Transparent vs non-transparent Data Link subpath behavior (open question 6):
  Views use whatever URL a Data Link resolves to.
- Org-wide View directory. Listing is owner-only + anyone with a Read Link.

## 3. What already exists (reuse, do not rebuild)

Backend:

- `NeuroglancerStateDB` (`fileglancer/database.py:108`) + full
  `/api/neuroglancer/nglinks` CRUD and `/ng/{short_key}` state-serving routes
  (`fileglancer/server.py:1007+`, `:1229`, `:1240`). Views mirror the
  state-serving mechanism.
- `ProxiedPathDB` / Data Links, keyed by `sharing_key`
  (`database.py:89`, routes `server.py:1120+`).
- Generic user preferences (`UserPreferenceDB`, `database.py:75`; routes
  `server.py:972-1005`) — the Layer Cart is stored here, not in a new table.
- `secrets.token_urlsafe(12)` key pattern for short/sharing keys.
- Linear Alembic chain; head at authoring time is
  `e7b2a9c4f130_add_name_to_jobs` (verify the live head before generating a
  migration — it advances as PRs merge).

Frontend:

- `/nglinks` page (`NGLinks.tsx` + `NGLinkContext` + `queries/ngLinkQueries.ts`)
  — the page Views replaces; its structure is the template for the Views page.
- `AppsLayout` top-tab sub-nav pattern (`src/layouts/AppsLayout.tsx`) with
  `FgBadge` counts — the template for the Views sub-nav.
- `TableCard` (`components/ui/Table/TableCard.tsx`) + generic
  `DataLinksActionsMenu` (`components/ui/Menus/DataLinksActions.tsx`).
- NG state generation (`src/omezarr-helper.ts`, surfaced via
  `useZarrMetadata.ts`) and NG URL parse/construct utils
  (`src/utils/neuroglancerUrl.ts`, incl. `constructNeuroglancerUrl`).
- The configured `neuroglancer` viewer entry + its `urlTemplate`, loaded by
  `ViewersContext` — this is the iframe base URL for embedding (no new config,
  no hosted build).
- Data-link consent dialog + gate (`components/ui/Dialogs/DataLink.tsx`,
  `PropertiesDrawer.tsx:281`, `hooks/useDataToolLinks.ts:244`) driven by the
  `areDataLinksAutomatic` preference (`PreferencesContext.tsx`).

Two net-new things the codebase lacks:

- **No in-app NG embed** — NG only ever opens in a new tab today.
- **No multi-select** in the file browser — it is single-select, no row
  checkboxes.

## 4. Data model

Two new tables. Everything else already exists.

```
views                                    view_layers (join)
-----                                    ------------------
id                                       id
short_key    (token_urlsafe, unique)     view_id      → views.id (FK)
read_key     (token_urlsafe, unique)     data_link_id → proxied_paths.id (FK, nullable)
edit_key     (token_urlsafe, unique)     layer_index
name                                     channel   (nullable)
ng_state     (JSON)                      opts      (JSON, nullable)
sharing_mode ('private' | 'read')        broken    (bool, default false)
owner        (username)
created_at / updated_at
```

- `ng_state` is the source of truth. The plain Neuroglancer link is *derived*
  from it and never stored separately.
- `view_layers` records the many-to-many between Views and Data Links, powering
  both discovery directions and the delete guard.
- `edit_key` is created but unused until the editable-Views stack — cutting it
  now avoids a second migration later.
  `# ponytail: edit_key reserved, unused until the edit stack`.
- `data_link_id` nullable + `broken` support the "mark broken" deletion path:
  null the link and flag the layer without deleting the View.
- **Layer Cart is not a table.** It is a single `UserPreferenceDB` row,
  `key = "neuroglancerCart"`, value a JSON array of
  `{ fsp_name, path, channel?, label }`. Server-side, per-user, survives
  reload/devices, via the existing preference CRUD.
  `# ponytail: cart-as-preference; a table only if it needs indexing or cross-user sharing`.

One Alembic migration adds both tables, chained off the current head
(`e7b2a9c4f130` at authoring time). Legacy `neuroglancer_states` is left
untouched.

## 5. API

All under the existing `/api/neuroglancer` prefix unless noted. The client
builds `ng_state` (state generation already lives in `omezarr-helper.ts`), so
the backend only stores it — no server-side NG state generation.

| Method + path | Purpose |
|---|---|
| `POST /api/neuroglancer/views` | Create a View from a client-built `ng_state` + layer list. Generates keys. |
| `GET /api/neuroglancer/views` | List the current user's Views. |
| `GET /api/neuroglancer/views/{short_key}` | Get one owned View (management). |
| `PUT /api/neuroglancer/views/{short_key}` | Owner rename / metadata update. |
| `DELETE /api/neuroglancer/views/{short_key}` | Delete an owned View. |
| `GET /ngview/{key}` | Resolve a View by **read_key**; serve `ng_state` JSON for the NG iframe (mirrors `/ng/{short_key}`, `Cache-Control: no-store`). |
| `GET /api/proxied-path/{sharing_key}/views` | Dependent Views for a Data Link (powers the delete dialog + "Appears in N Views"). |

Data Link deletion (`DELETE /api/proxied-path/{sharing_key}`) gains a mode
parameter — `mark_broken` or `cascade`:

- `mark_broken`: null `data_link_id` and set `broken = true` on each dependent
  `view_layer`, then delete the link. Views survive, degraded.
- `cascade`: delete the dependent Views (and their layers), then delete the link.

The frontend queries dependents first and drives the choice through one dialog
(see §7).

Read-key sessions never write to the database. Owner CRUD above is
authenticated as the owner and is not an "edit link" — it is basic management,
and stays in read-only scope.

## 6. Frontend architecture

- **Views page** mirrors `AppsLayout`'s top-tab pattern (the wireframe says
  "Apps-style sidebar," but Apps uses top tabs in code — match the code). Tabs:
  **Saved Views** and **Layer Cart** (count badge via `FgBadge`).
  - Saved Views: `TableCard` + a `useNGViewsColumns` hook + reused
    `DataLinksActionsMenu`. Columns: name / View link, layers, sharing, updated,
    actions (Open · Export ▾ · ⋯).
  - Export ▾ (client-side, from `ng_state`): Copy Neuroglancer link ·
    Download JSON state · Open in external Neuroglancer (reuse
    `constructNeuroglancerUrl`).
  - Layer Cart tab: Fiji/N5-Viewer-style tree, two-level (dataset + channel),
    channels lazy-load on expand, non-Zarr/N5 folders disabled →
    "Create View" checkout.
- **State**: new `ViewsContext` + `queries/viewQueries.ts` (mirror
  `NGLinkContext` / `ngLinkQueries.ts`); new `CartContext` backed by the
  `neuroglancerCart` preference.
- **Multi-select** (net-new) added to `FileTable` + `FileBrowserContext`: row
  checkboxes, a header select-all, selection set. Foundation for the selection
  bar and cart; lands before them in the stack.
- **Browser entry points**:
  - Row `⋯` menu (`FileTable` / `ContextMenu`): add "View in Neuroglancer"
    (scratch View) and "Add to Neuroglancer cart".
  - Floating selection bar (multi-row, ClickUp-style), shown when ≥1 row
    selected: Add to cart · New View from selection · Share · Download · More.
  - Right-edge icon rail (Browse only): **Properties (ⓘ)** ↔ **Cart (🛒 + count)**,
    swapping the drawer content. Selecting a file while Cart is open updates
    Properties in the background (dot on ⓘ), not stealing the panel.
  - Cart drawer: working list (review/remove) + "Create View" + "Open full
    Layer Cart".
  - Passive cart count on the header **NG Views** nav item (all routes) mirrored
    on the 🛒 rail icon (Browse) — informational, like Apps' "N jobs" badge.
- **Consent**: any View-creating action while `areDataLinksAutomatic` is OFF
  reuses the existing `DataLink.tsx` consent dialog (copy: "Create N links &
  open View", with the "don't ask again" toggle). ON ⇒ links created silently.
- **Properties drawer**: add an "Appears in N Views" section (dataset → Views),
  fed by `GET /api/proxied-path/{sharing_key}/views`.
- **Data Link delete dialog**: query dependents; if any, show the list + a
  choice of **Mark Views broken** or **Delete those Views**, plus **Cancel**;
  on confirm call `DELETE` with the chosen mode.
- **Embedded viewer** (`/ngview/:key`, read-only): iframe the configured
  `neuroglancer` viewer `urlTemplate`, hash-driven `#!{state}` where the state
  is served by `GET /ngview/{key}`. Thin chrome: a View toolbar (name, Export ▾,
  Fullscreen); Fullscreen hides the header + toolbar so the iframe fills the
  window (still the in-app session). No edit banner, no data panel in this scope.
  - **Scratch View**: "View in Neuroglancer" on a single dataset opens a
    read-only embedded View from client state; "Save as View" persists it via
    `POST /api/neuroglancer/views`. Unsaved scratch state is client-only — no
    server row, nothing to garbage-collect.
- **Navigation**: replace the Navbar "NG Links" entry with "NG Views" (+ passive
  cart count); `/nglinks` redirects to `/ngviews`.

## 7. Behavior details / decisions

- **Visibility**: owner-only listing; anyone with a Read Link can open. No ACL.
- **Read-link export**: a read-link visitor may Copy link / Download JSON of
  their local tweaks — client-side only, never written to the DB.
- **Selection granularity**: dataset + channel (two levels). Channels load
  lazily on expand. Maps onto the existing channel-per-layer code.
- **Data Link deletion**: one dialog — list dependent Views, user picks
  {mark broken | delete those Views}, or Cancel.
- **Scratch View lifetime**: client-only until saved.

## 8. The `gh stack` — six bottom-up PRs

Delivered via `gh stack` (official `github/gh-stack` extension). Each branch
targets the one below; `gh stack init` off `main`, `gh stack add <branch>` up
the chain, `gh stack submit` links them into stacked PRs on GitHub. Every PR is
independently reviewable and the chain merges bottom-up.

| # | Branch | Scope | Depends on |
|---|--------|-------|-----------|
| 1 | `ngviews-01-model` | `views` + `view_layers` tables (`edit_key` reserved), Pydantic models, Alembic migration. Pure-additive, zero behavior change. | `main` |
| 2 | `ngviews-02-api` | Views CRUD, `GET /ngview/{key}` (read key), dependent-views endpoint, Data Link delete modes. Backend tests. | 01 |
| 3 | `ngviews-03-multiselect` | Row checkboxes + multi-select in `FileTable` / `FileBrowserContext`. Isolated so the core-browser change reviews cleanly. | 02 |
| 4 | `ngviews-04-views-page` | `/ngviews` page (Saved Views table + Export menu), `ViewsContext`, `CartContext`, nav rename + `/nglinks` redirect. | 03 |
| 5 | `ngviews-05-browser-entry` | Row `⋯` items, floating selection bar, right-edge rail (Properties ↔ Cart), cart drawer, consent reuse, Properties "Appears in N Views", Data Link delete dialog, full Layer Cart tab + checkout. | 04 |
| 6 | `ngviews-06-embedded-readonly` | `/ngview/:key` read-only embedded iframe, thin chrome, Export, Fullscreen, scratch View + "Save as View". | 05 |

**Follow-up stack (not built here): editable Views** — edit-link sessions,
persist-on-change, the amber edit banner, the In-View Data Panel, and
`sharing_mode: read_edit` + two-link Share UI.

## 9. Testing

- **Backend** (`pixi run -e test test-backend`): model + migration round-trip;
  Views CRUD; `GET /ngview/{key}` read-key resolution and 404s; dependent-views
  query; both Data Link delete modes (mark-broken nulls the link + flags layers;
  cascade removes Views).
- **Frontend unit** (`pixi run test-frontend`): `viewQueries` / `CartContext`
  reducers; Export menu URL construction; multi-select selection logic;
  consent-gate branching on `areDataLinksAutomatic`.
- **E2E** (`pixi run test-ui`): add-to-cart → checkout → View appears in Saved
  Views → open embedded read-only viewer; selection-bar "New View from
  selection" with consent OFF → consent dialog → View; Data Link delete with a
  dependent View → dialog choice.

## 10. Open items carried forward (non-blocking)

- Which NG deployment `urlTemplate` backs the iframe in production (config, not
  code) — reuses the existing `neuroglancer` viewer entry.
- Whether legacy `neuroglancer_states` short links are migrated into Views
  (separate later stack).
