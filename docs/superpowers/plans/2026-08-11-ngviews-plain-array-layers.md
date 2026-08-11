# Plan: Views checkout must handle plain Zarr arrays (one layer per cart dataset)

Date: 2026-08-11
Branch: `ngviews-06-embedded-readonly`
Status: for review

## Problem

Adding several plain Zarr array directories to the Layer Cart (e.g. `.../seed6/data.zarr/affs`,
`/lsds`, `/img_zyx`, `/seg`) and clicking **Create View** should produce one Neuroglancer
layer per added directory. It does not. The saved View reports **0 layers**, expanding a cart
row throws a `not found: v3 array or group` pop-up, and opening the View shows a black
Neuroglancer with a single `1 new layer` tab.

This is **not** the "auto-detect all children of a `.zgroup`" feature requested on Slack. This is
the existing manual-add path failing for anything that is not an OME-Zarr multiscale group.

## Root cause

The checkout pipeline is OME-Zarr-first and never handles a bare array.

- `frontend/src/utils/viewCheckout.ts:37` — `generateStateForDataset` calls
  `getOmeZarrMetadata(ds.url)` for **every** dataset.
- `frontend/src/omezarr-helper.ts:598` — `getOmeZarrMetadata` calls
  `omezarr.getMultiscaleWithArray(store, 0)`, which demands a multiscale group. A plain array
  **throws** (`not found: v3 array or group`).
- The throw is caught at `viewCheckout.ts:53` and returns `null`, so the dataset is **dropped**
  (→ 0 layers).
- The fallback `generateNeuroglancerStateForDataURL` at `viewCheckout.ts:51` is **dead code**
  for plain arrays: it lives inside the ternary that only runs *after* `getOmeZarrMetadata`
  succeeds. When line 37 throws, the fallback never executes.
- The same throw surfaces raw in the channel-expand UI (`getOmeZarrChannels` →
  `getOmeZarrMetadata`) → error pop-up.

## Fix

Make `generateStateForDataset` fall back to a single plain-array layer when OME multiscale
detection fails, instead of returning `null`.

### 1. Add a plain-array state helper (`omezarr-helper.ts`)

```ts
// Open a plain Zarr array with auto-detected storage version and emit a
// single-layer NG state. Used when a cart dataset is a bare array, not an
// OME-Zarr multiscale group.
export async function generateStateForPlainZarr(dataUrl: string): Promise<string> {
  const store = new zarr.FetchStore(dataUrl, { overrides: { credentials: 'include' } });
  const arr = await omezarr.getArray(store, '/', undefined); // undefined = probe v2/v3
  const zarrVersion = arr.metadata.zarr_format as 2 | 3;
  return generateNeuroglancerStateForDataURL(dataUrl, zarrVersion);
}
```

Reuses existing `generateNeuroglancerStateForDataURL` (emits `type:'new'`, correct `|zarrN:`
source, layout `4panel-alt`). No new render logic.

### 2. Fall back in `generateStateForDataset` (`viewCheckout.ts`)

```ts
async function generateStateForDataset(ds): Promise<NgState | null> {
  try {
    const metadata = await getOmeZarrMetadata(ds.url);
    const multiscale = metadata.multiscales?.[0];
    const encoded = multiscale
      ? generateNeuroglancerStateForOmeZarr(ds.url, metadata.zarrVersion, 'image',
          multiscale, metadata.arr, metadata.labels, metadata.omero)
      : generateNeuroglancerStateForDataURL(ds.url, metadata.zarrVersion);
    return decodeState(encoded);
  } catch (omeError) {
    // Not an OME-Zarr multiscale group. Try a plain array before giving up.
    try {
      return decodeState(await generateStateForPlainZarr(ds.url));
    } catch (plainError) {
      log.error(`Failed to generate NG state for ${ds.url}`, omeError, plainError);
      return null; // genuinely broken (moved/deleted/not zarr) → skip, keep the rest
    }
  }
}
```

Result: N added array dirs → N layers. `null` now means "not a Zarr array at all", not
"not OME-Zarr".

### 3. Stop the channel-expand pop-up (`getOmeZarrChannels`, `omezarr-helper.ts:642`)

Plain arrays have no channels. `getOmeZarrMetadata` throws inside `getOmeZarrChannels`. Wrap so
a plain array returns `[]` instead of throwing; the cart row already shows the
"Channels load after the View is created." / single-array hint.

```ts
async function getOmeZarrChannels(dataUrl: string): Promise<string[]> {
  let metadata;
  try {
    metadata = await getOmeZarrMetadata(dataUrl);
  } catch {
    return []; // plain array / no multiscale → no channels to pick
  }
  // ...unchanged...
}
```

## Tests

- `frontend/src/__tests__/` unit test for `buildViewState`: mock `getOmeZarrMetadata` to throw
  and `generateStateForPlainZarr` to return a one-layer state; assert a 3-dataset cart yields
  `layers.length === 3` and `ng_state.layers.length === 3` (self-check for the branch/loop logic).
- Manual on dev: add `affs`, `lsds`, `img_zyx`, `seg` under `seed6/data.zarr`, Create View,
  confirm 4 layers in the Saved Views table and 4 tabs in the embedded viewer.

## Follow-up (deferred to later PRs in the stack)

QA on dev after the initial fix surfaced these; user chose to keep this branch to
the type-default fix and split the rest:

- **Per-layer type override in the Layer Cart**: image / segmentation /
  multi-channel selector per cart dataset, plumbed through `ViewLayerInput.opts`
  into the generated NG state. Covers segmentation-by-choice and the multichannel
  case below.
- **Multi-channel arrays (affs, lsds)**: a bare multi-channel float array renders
  as one grey channel because there is no channel dimension/shader. Needs the NG
  state to emit a local `c` dimension + shader; Neuroglancer cannot infer it
  without OME axis metadata. Overlaps the override work.
- **Show data paths on the view page**: `/view/:readKey` address bar is the short
  app route by design; **Copy link already yields the full Neuroglancer-style URL
  with every layer's data source embedded**. Optional: a panel on `/view` that
  lists each layer's full data URL, mirroring how a data link shows its path.

## Type default (done in this branch)

Plain-array fallback no longer emits `type:'new'` (which forces Neuroglancer's
layer-type picker and renders raw grey). `generateStateForPlainZarr` now opens the
array, guesses a type from name + dtype (`guessPlainLayerType`: integer dtype +
name matching `seg|label|mask` -> `segmentation`, else `image`), and uses the
explicit-type generator `generateNeuroglancerStateForZarrArray`. The existing
thumbnail-edge heuristic (`determineLayerType`) is not usable here — checkout has
no rendered thumbnail (see `viewCheckout.ts:39`).

## Out of scope (separate items, noted not fixed)

- **Misalignment**: cross-array coordinate spaces are not reconciled — first dataset's
  dimensions win (`viewCheckout.ts:75` ceiling). Arrays with differing scale/offset render
  misaligned. Expected; document, don't fix here.
- **Segmentation typing**: plain-array fallback emits `type:'new'`; `seg` shows as image, not a
  labels layer. Neuroglancer lets the user switch. Follow-up if auto-typing wanted.
- **UX (#1/#2/#3)**: "Create View" button semantics, channels-load-after-create ordering, and
  duplicate-View-on-repeat-click are real but independent of this data bug. Track separately.
- **`.zgroup` auto fan-out** (the Slack feature): not this. Explicitly not doing it.

## Risk

Low. Additive fallback; OME-Zarr path unchanged. Worst case a genuinely broken dir is still
skipped (same as today). `omezarr.getArray(store, '/', undefined)` version-probe is the one
external assumption — verify it resolves v2 arrays on dev before merge.
