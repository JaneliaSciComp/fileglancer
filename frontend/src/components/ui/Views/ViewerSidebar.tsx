import { useMemo, useState } from 'react';
import { IconButton, Tabs } from '@material-tailwind/react';
import toast from 'react-hot-toast';
import { HiX } from 'react-icons/hi';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import SidebarFileBrowser from '@/components/ui/Views/SidebarFileBrowser';
import SourcesList from '@/components/ui/Views/SourcesList';
import { useAddToView } from '@/hooks/useAddToView';
import { useViewSources } from '@/hooks/useViewSources';
import type { NeuroglancerBridge } from '@/hooks/useNeuroglancerViewer';
import type { LiveSource } from '@/hooks/useViewSources';
import type { ViewEditState } from '@/hooks/useViewEditState';
import type { ViewLayer } from '@/queries/viewQueries';
import type { NgState } from '@/utils/viewCheckout';

type ViewerSidebarProps = {
  readonly bridge: NeuroglancerBridge;
  /** The View's saved layer rows. */
  readonly viewLayers: ViewLayer[];
  readonly editState: ViewEditState;
  readonly onClose: () => void;
};

/**
 * The owner's panel beside the embedded viewer: add data to the View, and
 * see or remove what's in it. Both tabs edit the viewer's local state, kept
 * until Save.
 */
export default function ViewerSidebar({
  bridge,
  viewLayers,
  editState,
  onClose
}: ViewerSidebarProps) {
  const { markEdited, addSources, recordAdded, removeSource } = editState;
  const addToView = useAddToView(bridge, {
    viewLayers,
    onEdited: markEdited,
    onAddSources: addSources,
    onAdded: recordAdded
  });
  const [tab, setTab] = useState('add');
  const sources = useViewSources(bridge, {
    viewLayers,
    added: editState.added,
    pendingSources: editState.pendingSources,
    removedSources: editState.removedSources
  });
  const viewSources = useMemo(
    () =>
      sources.flatMap(s =>
        s.fsp_name !== null && s.path !== null && !s.unsupported
          ? [{ fsp_name: s.fsp_name, path: s.path }]
          : []
      ),
    [sources]
  );

  const remove = (source: LiveSource) => {
    if (source.unsupported && source.sharing_key !== null) {
      removeSource(source.sharing_key);
    } else {
      const state = bridge.getState() as NgState;
      const gone = new Set(source.layerNames);
      const next: NgState = {
        ...state,
        layers: (state.layers ?? []).filter(l => !gone.has(l.name as string))
      };
      const selected = state.selectedLayer as { layer?: string } | undefined;
      if (selected?.layer && gone.has(selected.layer)) {
        delete next.selectedLayer;
      }
      bridge.setState(next);
      markEdited();
    }
    toast.success(`Removed ${source.label}. Save to keep the change.`);
  };

  // Both tabs stay mounted (MT's Tabs.Panel unmounts inactive panels) so
  // switching keeps the browser's folder and checks.
  return (
    <aside aria-label="View data sidebar" className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 bg-surface pr-2 dark:bg-surface-light">
        {/* Content-width triggers, as in the Properties panel: MT measures
            the indicator only on window resize, so triggers that stretch
            with the panel, or wrap when it narrows, would leave it behind. */}
        <Tabs className="min-w-0 flex-1" onValueChange={setTab} value={tab}>
          <Tabs.List className="justify-start items-stretch shrink-0 min-w-fit w-full py-2 bg-surface dark:bg-surface-light">
            <Tabs.Trigger
              className="!text-foreground h-full whitespace-nowrap"
              value="add"
            >
              Add data
            </Tabs.Trigger>
            <Tabs.Trigger
              className="!text-foreground h-full whitespace-nowrap"
              value="sources"
            >
              Sources
            </Tabs.Trigger>
            <Tabs.TriggerIndicator className="h-full" />
          </Tabs.List>
        </Tabs>
        <IconButton
          aria-label="Close sidebar"
          onClick={onClose}
          size="sm"
          variant="ghost"
        >
          <FgIcon icon={HiX} />
        </IconButton>
      </div>
      <div
        aria-label="Add data"
        className={`min-h-0 flex-1 flex-col overflow-y-auto p-3 ${tab === 'add' ? 'flex' : 'hidden'}`}
        role="tabpanel"
      >
        <SidebarFileBrowser addToView={addToView} viewSources={viewSources} />
      </div>
      <div
        aria-label="Sources"
        className={`min-h-0 flex-1 flex-col overflow-y-auto p-3 ${tab === 'sources' ? 'flex' : 'hidden'}`}
        role="tabpanel"
      >
        <SourcesList onRemove={remove} sources={sources} />
      </div>
    </aside>
  );
}
