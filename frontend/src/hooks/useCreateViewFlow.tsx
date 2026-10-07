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
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgCheckbox from '@/components/designSystem/atoms/formElements/FgCheckbox';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import FgSwitch from '@/components/designSystem/atoms/formElements/FgSwitch';
import FgDialog from '@/components/ui/Dialogs/FgDialog';
import type { CartItem } from '@/queries/preferencesQueries';
import type { View } from '@/queries/viewQueries';

type PendingRequest = {
  datasets: CartItem[];
  newLinkCount: number;
  needsLinkConsent: boolean;
} & (
  | { mode: 'create'; onCreated?: (view: View) => void }
  | { mode: 'add'; add: (datasets: CartItem[]) => Promise<void> }
);

export function useCreateViewFlow() {
  const { checkout } = useCartCheckout();
  const {
    areDataLinksAutomatic,
    dataLinkSubpathMode,
    toggleAutomaticDataLinks
  } = usePreferencesContext();
  const allProxiedPathsQuery = useAllProxiedPathsQuery();
  const navigate = useNavigate();

  const [pending, setPending] = useState(false);
  const [name, setName] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { hasMismatch } = useCartDimensionCheck(request?.datasets ?? []);

  const runRequest = async () => {
    if (!request) {
      return;
    }
    setPending(true);
    try {
      if (request.mode === 'add') {
        await request.add(request.datasets);
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

  const linkConsent = (datasets: CartItem[]) => {
    const existingKeys = new Set(
      (allProxiedPathsQuery.data ?? []).map(p => datasetKey(p.fsp_name, p.path))
    );
    const newLinkCount = new Set(
      datasets
        .map(ds => datasetKey(ds.fsp_name, ds.path))
        .filter(key => !existingKeys.has(key))
    ).size;
    const autoLinksCoverThis =
      areDataLinksAutomatic && dataLinkSubpathMode !== 'custom';
    return {
      newLinkCount,
      needsLinkConsent: !autoLinksCoverThis && newLinkCount > 0
    };
  };

  const startCreateView = (
    datasets: CartItem[],
    defaultName: string,
    onCreated?: (view: View) => void
  ) => {
    if (datasets.length === 0) {
      toast.error('Nothing to add');
      return;
    }
    setName(defaultName);
    setAcknowledged(false);
    setRequest({
      datasets,
      ...linkConsent(datasets),
      mode: 'create',
      onCreated
    });
  };

  const startAddToView = (
    datasets: CartItem[],
    hasMismatch: boolean,
    add: (datasets: CartItem[]) => Promise<void>
  ) => {
    if (datasets.length === 0) {
      toast.error('Nothing to add');
      return;
    }
    const consent = linkConsent(datasets);
    if (!consent.needsLinkConsent && !hasMismatch) {
      // Nothing to ask, and unlike Create View there's no name to pick.
      setPending(true);
      add(datasets)
        .catch(error =>
          toast.error(error instanceof Error ? error.message : 'Add failed')
        )
        .finally(() => setPending(false));
      return;
    }
    setAcknowledged(false);
    setRequest({ datasets, ...consent, mode: 'add', add });
  };

  const open = request !== null;
  const creating = request?.mode === 'create';
  const dialog: ReactNode = request ? (
    <FgDialog
      initialFocus={creating ? nameInputRef : undefined}
      onClose={() => setRequest(null)}
      open={open}
    >
      <div className="flex flex-col gap-2 my-4">
        <Typography className="text-foreground font-semibold">
          {creating ? 'Create View' : 'Add to this View'}
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
              This will create {request.newLinkCount} data link
              {request.newLinkCount === 1 ? '' : 's'}
              {creating ? ' and 1 View' : ''}. If you share the data link(s)
              with internal collaborators, they will be able to view these data.
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
          <div className="flex flex-col gap-2">
            <Typography className="text-warning font-semibold">
              Some layers have dimensions that differ from the first layer.
            </Typography>
            <FgCheckbox
              checked={acknowledged}
              label={
                creating
                  ? "I understand I'm creating a view with mismatched dimensions."
                  : "I understand I'm adding layers with mismatched dimensions."
              }
              onChange={e => setAcknowledged(e.target.checked)}
            />
          </div>
        ) : null}

        <div className="flex gap-4">
          <FgButton
            disabled={
              pending ||
              (creating && name.trim() === '') ||
              (hasMismatch && !acknowledged)
            }
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

  return { startCreateView, startAddToView, dialog, pending };
}
