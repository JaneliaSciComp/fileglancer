import { useEffect, useMemo, useState } from 'react';
import { Typography } from '@material-tailwind/react';

import FgButton from '@/components/designSystem/atoms/FgButton';
import FileSelectorBrowser from '@/components/ui/FileSelector/FileSelectorBrowser';
import { useCartDimensionCheck } from '@/hooks/useCartDimensionCheck';
import { useCreateViewFlow } from '@/hooks/useCreateViewFlow';
import useFileSelector from '@/hooks/useFileSelector';
import type { CartItem } from '@/contexts/CartContext';
import type { DatasetRef } from '@/hooks/useCartDimensionCheck';
import type { UrlPrefixes } from '@/hooks/useCartCheckout';
import type { FileOrFolder } from '@/shared.types';

type SidebarFileBrowserProps = {
  /** The datasets in the viewer now, in layer order: the dimension reference. */
  readonly viewSources: DatasetRef[];
  readonly addToView: (
    items: CartItem[],
    options?: { urlPrefixes?: UrlPrefixes }
  ) => Promise<void>;
};

/**
 * The file selector dialog's browser in the viewer's "Add data" sidebar:
 * navigate, check datasets, add them to the open View. Only checked datasets
 * are probed, so their warnings show before adding, not on every row.
 */
export default function SidebarFileBrowser({
  viewSources,
  addToView
}: SidebarFileBrowserProps) {
  const selector = useFileSelector({ defaultToHome: true, includeCloud: true });
  const { state, displayItems, navigateToLocation, handleItemDoubleClick } =
    selector;
  const { startAddToView, dialog, pending } = useCreateViewFlow();
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());

  const location = state.currentLocation;
  const fspName = location.type === 'filesystem' ? location.fspName : null;
  const items = useMemo<CartItem[]>(
    () =>
      fspName === null
        ? []
        : displayItems
            .filter(f => checked.has(f.path))
            .map(f => ({ fsp_name: fspName, path: f.path, label: f.name })),
    [displayItems, checked, fspName]
  );
  const { mismatchedKeys, hasMismatch, kindByKey } = useCartDimensionCheck(
    items,
    viewSources
  );
  const kinds = [...kindByKey.values()];
  const checking = kinds.includes('loading');
  const unsupportedCount = kinds.filter(k => k === 'unsupported').length;

  // Checks belong to the folder on screen, as on the Browse page, so an
  // add never mixes folders or file shares.
  useEffect(() => {
    setChecked(new Set());
  }, [location]);

  // Follow a symlink into its target share, as the Browse page does; one
  // with no target share is broken or points outside every share.
  const open = (item: FileOrFolder) => {
    if (!item.is_dir) {
      return;
    }
    if (item.symlink_target_fsp) {
      navigateToLocation({
        type: 'filesystem',
        fspName: item.symlink_target_fsp.fsp_name,
        path: item.symlink_target_fsp.subpath || '.'
      });
    } else if (!item.is_symlink) {
      handleItemDoubleClick(item);
    }
  };

  const toggle = (item: FileOrFolder) =>
    setChecked(prev => {
      const next = new Set(prev);
      if (!next.delete(item.path)) {
        next.add(item.path);
      }
      return next;
    });

  const add = () =>
    startAddToView(items, hasMismatch, async (datasets, urlPrefixes) => {
      await addToView(datasets, { urlPrefixes });
      setChecked(new Set());
    });

  const datasets = (n: number) => `${n} ${n === 1 ? 'dataset' : 'datasets'}`;
  const warnings = [
    unsupportedCount > 0 &&
      `${datasets(unsupportedCount)} can't load as a Neuroglancer layer and will be listed as ${unsupportedCount === 1 ? 'a source' : 'sources'} only.`,
    mismatchedKeys.size > 0 &&
      `${datasets(mismatchedKeys.size)} ${mismatchedKeys.size === 1 ? 'has' : 'have'} dimensions that differ from the first layer.`
  ].filter((w): w is string => !!w);

  return (
    // The shared browser is sized for the dialog; shrink all of its text
    // (MT's Typography sets its own size, so inheriting text-sm won't do).
    <section
      aria-label="Browse files"
      className="flex min-h-0 flex-1 flex-col [&_*]:!text-sm"
    >
      <FileSelectorBrowser
        checkedPaths={checked}
        onItemClick={item => {
          if (location.type === 'filesystem') {
            toggle(item);
          }
        }}
        onItemDoubleClick={open}
        onToggleChecked={toggle}
        pathInputPosition="top"
        selector={selector}
        tableClassName="my-2 min-h-[10rem] flex-1"
      />
      {checking ? (
        <Typography className="mb-2 text-foreground/70">
          Checking {items.length === 1 ? 'the dataset' : 'the datasets'}...
        </Typography>
      ) : (
        warnings.map(w => (
          <Typography
            className="mb-2 text-warning-dark dark:text-warning-light"
            key={w}
          >
            {w}
          </Typography>
        ))
      )}
      <FgButton
        // The checks aren't final until every checked dataset is probed.
        disabled={pending || checking || items.length === 0}
        loading={pending}
        loadingText="Adding..."
        onClick={add}
      >
        {items.length > 0
          ? `Add ${items.length} to this View`
          : 'Add to this View'}
      </FgButton>
      {dialog}
    </section>
  );
}
