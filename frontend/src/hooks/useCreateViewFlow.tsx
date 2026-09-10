import { useState } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import type { ReactNode } from 'react';

import { useCartCheckout } from '@/hooks/useCartCheckout';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useAllProxiedPathsQuery } from '@/queries/proxiedPathQueries';
import { datasetKey } from '@/utils/pathHandling';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import FgSwitch from '@/components/designSystem/atoms/formElements/FgSwitch';
import FgDialog from '@/components/ui/Dialogs/FgDialog';
import type { CartItem } from '@/queries/preferencesQueries';
import type { View } from '@/queries/viewQueries';

type PendingRequest = {
  datasets: CartItem[];
  onCreated?: (view: View) => void;
  newLinkCount: number;
  needsLinkConsent: boolean;
};

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
  const [request, setRequest] = useState<PendingRequest | null>(null);

  const runCheckout = async () => {
    if (!request) {
      return;
    }
    setPending(true);
    try {
      const view = await checkout(request.datasets, name);
      toast.success(`Created View "${name}"`);
      if (request.onCreated) {
        request.onCreated(view);
      } else {
        navigate('/ngviews');
      }
      setRequest(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Checkout failed');
    } finally {
      setPending(false);
    }
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

    setName(defaultName);
    setRequest({
      datasets,
      onCreated,
      newLinkCount,
      needsLinkConsent: !autoLinksCoverThis && newLinkCount > 0
    });
  };

  const open = request !== null;
  const dialog: ReactNode = request ? (
    <FgDialog onClose={() => setRequest(null)} open={open}>
      <div className="flex flex-col gap-2 my-4">
        <Typography className="text-foreground font-semibold">
          Create View
        </Typography>
        <FgInput
          aria-label="View name"
          onChange={e => setName(e.target.value)}
          value={name}
        />

        {request.needsLinkConsent ? (
          <>
            <Typography className="text-foreground font-semibold">
              Are you sure you want to create a data link?
            </Typography>
            <Typography className="text-foreground">
              This will create {request.newLinkCount} data link
              {request.newLinkCount === 1 ? '' : 's'} and 1 View. If you share
              the data link(s) with internal collaborators, they will be able to
              view these data.
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

        <div className="flex gap-4">
          <FgButton
            disabled={pending || name.trim() === ''}
            loading={pending}
            loadingText="Creating..."
            onClick={() => void runCheckout()}
          >
            {request.needsLinkConsent ? 'Continue' : 'Create'}
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

  return { startCreateView, dialog, pending };
}
