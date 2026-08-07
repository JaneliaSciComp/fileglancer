import { useState } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';

import { useCartCheckout } from '@/hooks/useCartCheckout';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useAllProxiedPathsQuery } from '@/queries/proxiedPathQueries';
import { datasetKey } from '@/utils/pathHandling';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgSwitch from '@/components/designSystem/atoms/formElements/FgSwitch';
import FgDialog from '@/components/ui/Dialogs/FgDialog';
import type { CartItem } from '@/queries/preferencesQueries';
import type { View } from '@/queries/viewQueries';

interface CreateViewButtonProps {
  readonly datasets: CartItem[];
  readonly defaultName: string;
  readonly label?: string;
  readonly disabled?: boolean;
  readonly onCreated?: (view: View) => void;
}

export default function CreateViewButton({
  datasets,
  defaultName,
  label = 'Create View',
  disabled = false,
  onCreated
}: CreateViewButtonProps) {
  const { checkout } = useCartCheckout();
  const {
    areDataLinksAutomatic,
    dataLinkSubpathMode,
    toggleAutomaticDataLinks
  } = usePreferencesContext();
  const allProxiedPathsQuery = useAllProxiedPathsQuery();
  const navigate = useNavigate();

  const [showConsent, setShowConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [newLinkCount, setNewLinkCount] = useState(0);

  const runCheckout = async () => {
    setPending(true);
    try {
      const view = await checkout(datasets, defaultName);
      toast.success(`Created View "${defaultName}"`);
      if (onCreated) {
        onCreated(view);
      } else {
        navigate('/ngviews');
      }
      setShowConsent(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Checkout failed');
    } finally {
      setPending(false);
    }
  };

  const handleClick = () => {
    if (datasets.length === 0) {
      toast.error('Nothing to add');
      return;
    }

    const existingKeys = new Set(
      (allProxiedPathsQuery.data ?? []).map(p => datasetKey(p.fsp_name, p.path))
    );
    const computedNewLinkCount = new Set(
      datasets
        .map(ds => datasetKey(ds.fsp_name, ds.path))
        .filter(key => !existingKeys.has(key))
    ).size;

    const autoLinksCoverThis =
      areDataLinksAutomatic && dataLinkSubpathMode !== 'custom';

    if (autoLinksCoverThis || computedNewLinkCount === 0) {
      void runCheckout();
      return;
    }

    setNewLinkCount(computedNewLinkCount);
    setShowConsent(true);
  };

  return (
    <>
      {!showConsent ? (
        <FgButton
          disabled={disabled || pending}
          loading={pending}
          loadingText="Creating..."
          onClick={handleClick}
        >
          {label}
        </FgButton>
      ) : null}

      {showConsent ? (
        <FgDialog onClose={() => setShowConsent(false)} open={showConsent}>
          <div className="flex flex-col gap-2 my-4">
            <Typography className="text-foreground font-semibold">
              Are you sure you want to create a data link?
            </Typography>
            <Typography className="text-foreground">
              This will create {newLinkCount} data link
              {newLinkCount === 1 ? '' : 's'} and 1 View. If you share the data
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
            <div className="flex gap-4">
              <FgButton
                disabled={pending}
                loading={pending}
                onClick={runCheckout}
              >
                Continue
              </FgButton>
              <FgButton
                disabled={pending}
                onClick={() => setShowConsent(false)}
                variant="ghost"
              >
                Cancel
              </FgButton>
            </div>
          </div>
        </FgDialog>
      ) : null}
    </>
  );
}
