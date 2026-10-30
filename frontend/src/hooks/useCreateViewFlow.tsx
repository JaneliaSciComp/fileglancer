import { useRef, useState } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import type { ReactNode } from 'react';

import { useCartCheckout } from '@/hooks/useCartCheckout';
import { useCartDimensionCheck } from '@/hooks/useCartDimensionCheck';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useAllProxiedPathsQuery } from '@/queries/proxiedPathQueries';
import { datasetKey } from '@/utils/pathHandling';
import { buildUrl } from '@/utils';
import { buildViewState } from '@/utils/viewCheckout';
import type { ResolvedCheckoutDataset } from '@/utils/viewCheckout';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import FgSwitch from '@/components/designSystem/atoms/formElements/FgSwitch';
import FgDialog from '@/components/ui/Dialogs/FgDialog';
import type { CartItem } from '@/queries/preferencesQueries';
import type { View, ViewCreateRequest } from '@/queries/viewQueries';

/** Handed to /view/new (new tab: localStorage; same tab: router state); saved only on Save. */
export type ViewDraft = Pick<
  ViewCreateRequest,
  'name' | 'ng_state' | 'layers'
> & {
  /** What `layers` were built from, so the Sources tab can name them. */
  datasets: ResolvedCheckoutDataset[];
};
export const DRAFT_VIEW_PATH = '/view/new';
const DRAFT_STORAGE_PREFIX = 'fg-view-draft:';
// Drafts from tabs closed unsaved are never cleaned up by the tab itself;
// they age out the next time a draft is stored.
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
type StoredDraft = { draft: ViewDraft; storedAt: number };

/** Stores the draft for a new tab; returns the URL that tab should open. */
export function storeDraft(draft: ViewDraft): string {
  const now = Date.now();
  Object.keys(localStorage)
    .filter(k => k.startsWith(DRAFT_STORAGE_PREFIX))
    .forEach(k => {
      const storedAt = (JSON.parse(localStorage.getItem(k)!) as StoredDraft)
        .storedAt;
      if (now - storedAt > DRAFT_MAX_AGE_MS) {
        localStorage.removeItem(k);
      }
    });
  const id = crypto.randomUUID();
  const stored: StoredDraft = { draft, storedAt: now };
  localStorage.setItem(DRAFT_STORAGE_PREFIX + id, JSON.stringify(stored));
  return buildUrl(DRAFT_VIEW_PATH, null, { draft: id });
}

export function loadDraft(id: string | null): ViewDraft | undefined {
  const raw = id && localStorage.getItem(DRAFT_STORAGE_PREFIX + id);
  return raw ? (JSON.parse(raw) as StoredDraft).draft : undefined;
}

export function clearDraft(id: string | null) {
  if (id) {
    localStorage.removeItem(DRAFT_STORAGE_PREFIX + id);
  }
}

type PendingRequest = {
  datasets: CartItem[];
  /** One dataset per Data Link checkout will create. */
  newLinks: CartItem[];
  needsLinkConsent: boolean;
} & (
  | { mode: 'create'; onCreated?: (view: View) => void }
  // Opens the viewer on an unsaved View named `name`; nothing is saved yet.
  | { mode: 'draft'; name: string }
  | {
      mode: 'add';
      add: (datasets: CartItem[]) => Promise<void>;
      // Checked against the View's own datasets by the caller.
      hasMismatch: boolean;
    }
);

export function useCreateViewFlow() {
  const { checkout, resolveCartDatasets, isServedWithoutLink } =
    useCartCheckout();
  const {
    areDataLinksAutomatic,
    dataLinkSubpathMode,
    toggleAutomaticDataLinks,
    disableHeuristicalLayerTypeDetection
  } = usePreferencesContext();
  const allProxiedPathsQuery = useAllProxiedPathsQuery();
  const navigate = useNavigate();

  const [pending, setPending] = useState(false);
  const [name, setName] = useState('');
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const cartCheck = useCartDimensionCheck(request?.datasets ?? []);
  const hasMismatch =
    request?.mode === 'add' ? request.hasMismatch : cartCheck.hasMismatch;

  // Open the tab while the click's user activation is still fresh: the
  // consent check can fetch, and building the state renders a thumbnail per
  // dataset, either of which can outlast it and get the popup blocked. Falls
  // back to this tab if blocked anyway. No 'noopener': it makes window.open
  // return null, which reads as blocked.
  const openTab = () => window.open('', '_blank');

  const openDraft = async (
    datasets: CartItem[],
    name: string,
    tab: Window | null = openTab()
  ) => {
    try {
      const resolved = await resolveCartDatasets(datasets);
      const { ng_state, layers } = await buildViewState(
        resolved,
        !disableHeuristicalLayerTypeDetection
      );
      const draft: ViewDraft = { name, ng_state, layers, datasets: resolved };
      if (tab) {
        tab.location.href = storeDraft(draft);
      } else {
        navigate(DRAFT_VIEW_PATH, { state: { draft } });
      }
    } catch (error) {
      tab?.close();
      throw error;
    }
  };

  const runRequest = async () => {
    if (!request) {
      return;
    }
    setPending(true);
    try {
      if (request.mode === 'add') {
        await request.add(request.datasets);
      } else if (request.mode === 'draft') {
        await openDraft(request.datasets, request.name);
      } else {
        const view = await checkout(request.datasets, name);
        toast.success(`Created View "${name}"`);
        if (request.onCreated) {
          request.onCreated(view);
        } else {
          navigate('/ngviews');
        }
      }
      setRequest(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Checkout failed');
    } finally {
      setPending(false);
    }
  };

  const linkConsent = async (datasets: CartItem[]) => {
    const existingKeys = new Set(
      (allProxiedPathsQuery.data ?? []).map(p => datasetKey(p.fsp_name, p.path))
    );
    const newLinksByKey = new Map<string, CartItem>();
    for (const ds of datasets) {
      const key = datasetKey(ds.fsp_name, ds.path);
      // Buckets and externally mapped paths need no Data Link, so they never count
      if (
        !existingKeys.has(key) &&
        !newLinksByKey.has(key) &&
        !(await isServedWithoutLink(ds))
      ) {
        newLinksByKey.set(key, ds);
      }
    }
    const newLinks = [...newLinksByKey.values()];
    const autoLinksCoverThis =
      areDataLinksAutomatic && dataLinkSubpathMode !== 'custom';
    return {
      newLinks,
      needsLinkConsent: !autoLinksCoverThis && newLinks.length > 0
    };
  };

  // Checking for external URLs can fetch, so the start* entry points are
  // async; `pending` covers the check and whatever `then` awaits.
  const withConsent = (
    datasets: CartItem[],
    then: (
      consent: Awaited<ReturnType<typeof linkConsent>>
    ) => void | Promise<void>,
    failMessage: string,
    onAbort?: () => void
  ) => {
    if (datasets.length === 0) {
      toast.error('Nothing to add');
      onAbort?.();
      return;
    }
    setPending(true);
    linkConsent(datasets)
      .then(then)
      .catch(error => {
        onAbort?.();
        toast.error(error instanceof Error ? error.message : failMessage);
      })
      .finally(() => setPending(false));
  };

  const startCreateView = (
    datasets: CartItem[],
    defaultName: string,
    onCreated?: (view: View) => void
  ) =>
    withConsent(
      datasets,
      consent => {
        setName(defaultName);
        setRequest({ datasets, ...consent, mode: 'create', onCreated });
      },
      'Checkout failed'
    );

  /** Opens a View in the viewer without saving it; consent dialog only if needed. */
  const startDraftView = (datasets: CartItem[], name: string) => {
    const tab = openTab();
    withConsent(
      datasets,
      consent => {
        if (!consent.needsLinkConsent) {
          return openDraft(datasets, name, tab);
        }
        // The dialog's Continue click opens a fresh tab.
        tab?.close();
        setRequest({ datasets, ...consent, mode: 'draft', name });
      },
      'Open failed',
      () => tab?.close()
    );
  };

  const startAddToView = (
    datasets: CartItem[],
    hasMismatch: boolean,
    add: (datasets: CartItem[]) => Promise<void>
  ) =>
    withConsent(
      datasets,
      consent => {
        if (!consent.needsLinkConsent && !hasMismatch) {
          // Nothing to ask, and unlike Create View there's no name to pick.
          return add(datasets);
        }
        setRequest({ datasets, ...consent, mode: 'add', add, hasMismatch });
      },
      'Add failed'
    );

  const open = request !== null;
  const creating = request?.mode === 'create';
  const drafting = request?.mode === 'draft';
  const dialog: ReactNode = request ? (
    <FgDialog
      initialFocus={creating ? nameInputRef : undefined}
      onClose={() => setRequest(null)}
      open={open}
    >
      <div className="flex flex-col gap-2 my-4">
        <Typography className="text-foreground font-semibold">
          {creating || drafting ? 'Create View' : 'Add to this View'}
        </Typography>
        {creating ? (
          <FgInput
            aria-label="View name"
            onChange={e => setName(e.target.value)}
            onFocus={e => e.target.select()}
            ref={nameInputRef}
            value={name}
          />
        ) : null}

        {request.needsLinkConsent ? (
          <>
            <Typography className="text-foreground font-semibold">
              Are you sure you want to create a data link?
            </Typography>
            <Typography className="text-foreground">
              This will create {request.newLinks.length} data link
              {request.newLinks.length === 1 ? '' : 's'}
              {creating || drafting ? ' and 1 View' : ''}. If you share the data
              link(s) with internal collaborators, they will be able to view
              these data.
            </Typography>
            <div className="flex flex-col gap-2">
              <Typography className="font-semibold text-foreground">
                Don't ask me this again:
              </Typography>
              <FgSwitch
                checked={areDataLinksAutomatic}
                label="Automatically create data links"
                onChange={() => {
                  void toggleAutomaticDataLinks();
                }}
              />
            </div>
          </>
        ) : null}

        {hasMismatch ? (
          <div className="flex flex-col gap-1">
            <Typography className="text-warning-dark dark:text-warning-light font-semibold">
              Some layers have dimensions that differ from the first layer.
            </Typography>
            <Typography className="text-foreground">
              {creating
                ? 'Expand each dataset in the Layer Cart to see its full dimensions.'
                : "After adding, see each dataset's full dimensions in the Sources tab."}
            </Typography>
          </div>
        ) : null}

        <div className="flex gap-4">
          <FgButton
            disabled={pending || (creating && name.trim() === '')}
            loading={pending}
            loadingText={creating ? 'Creating...' : 'Adding...'}
            onClick={() => void runRequest()}
          >
            {request.needsLinkConsent
              ? 'Continue'
              : creating
                ? 'Create'
                : 'Add'}
          </FgButton>
          <FgButton
            disabled={pending}
            onClick={() => setRequest(null)}
            variant="ghost"
          >
            Cancel
          </FgButton>
        </div>
      </div>
    </FgDialog>
  ) : null;

  return { startCreateView, startDraftView, startAddToView, dialog, pending };
}
