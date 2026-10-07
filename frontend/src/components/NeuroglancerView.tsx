import { useEffect, useRef, useState } from 'react';
import type { IconType } from 'react-icons';
import { Link, useNavigate, useParams } from 'react-router';
import { IconButton, Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';
import {
  HiOutlineShare,
  HiOutlineDownload,
  HiOutlineExternalLink,
  HiOutlineArrowsExpand,
  HiOutlinePlusCircle
} from 'react-icons/hi';

import { useViewStateByReadKey } from '@/queries/viewQueries';
import { useViewsContext } from '@/contexts/ViewsContext';
import { useInternalNeuroglancerBaseUrl } from '@/hooks/useDefaultNeuroglancerBaseUrl';
import { useCanEditView } from '@/hooks/useCanEditView';
import { useNeuroglancerViewer } from '@/hooks/useNeuroglancerViewer';
import { useViewEditState } from '@/hooks/useViewEditState';
import { constructNeuroglancerUrl } from '@/utils/neuroglancerUrl';
import { downloadTextFile } from '@/utils';
import { copyToClipboard } from '@/utils/copyText';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgLink from '@/components/designSystem/atoms/FgLink';
import LogoSvg from '@/components/ui/Navbar/LogoSvg';
import ProfileMenu from '@/components/ui/Navbar/ProfileMenu';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import InlineNameEditor from '@/components/ui/widgets/InlineNameEditor';
import RelinkDialog from '@/components/ui/Dialogs/RelinkDialog';
import UnsavedChangesDialog from '@/components/ui/Dialogs/UnsavedChangesDialog';
import type { RelinkTarget } from '@/components/ui/Dialogs/RelinkDialog';
import ViewBrokenBanner from '@/components/ui/Views/ViewBrokenBanner';
import ViewSaveBar from '@/components/ui/Views/ViewSaveBar';
import ViewerSidebar from '@/components/ui/Views/ViewerSidebar';

type ToolbarIconButtonProps = {
  readonly label: string;
  readonly icon: IconType;
  readonly onClick: () => void;
  readonly pressed?: boolean;
};

function ToolbarIconButton({
  label,
  icon,
  onClick,
  pressed
}: ToolbarIconButtonProps) {
  return (
    <FgTooltip label={label}>
      <IconButton
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        size="sm"
        variant="ghost"
      >
        <FgIcon icon={icon} size="lg" />
      </IconButton>
    </FgTooltip>
  );
}

type NgState = Record<string, unknown>;

/** An action the owner confirmed past the unsaved-changes dialog. */
type PendingAction = {
  readonly message: string;
  /** Gets the saved state: the one just saved, or the last saved one. */
  readonly run: (state: NgState) => void;
};

const LEAVE_MESSAGE =
  'This View has unsaved changes. Leaving this page discards them.';
const EXPORT_MESSAGE =
  "This View has unsaved changes. Without saving, this uses the last saved version, which doesn't include them.";

const warnChangesLost = () =>
  toast.error('Neuroglancer reloaded, so unsaved changes may have been lost');

export default function NeuroglancerView() {
  const { readKey } = useParams();
  const navigate = useNavigate();
  const stateQuery = useViewStateByReadKey(readKey);
  // The public read_key endpoint returns only ng_state. Ownership, name and
  // short_key come from the owner's own Views list (cached app-wide); a miss
  // means "not mine" and the title renders read-only.
  const { updateViewMutation } = useViewsContext();
  const { canEdit, view: ownedView } = useCanEditView(readKey);
  const baseUrl = useInternalNeuroglancerBaseUrl();
  const containerRef = useRef<HTMLDivElement>(null);
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null);
  const bridge = useNeuroglancerViewer(iframe);
  const editState = useViewEditState(bridge, warnChangesLost);
  const ngState = stateQuery.data;

  // Set once from the first loaded state: later refetches (rename, Save)
  // must not reload Neuroglancer. Changes after load go through the bridge.
  // Wait out the mount refetch: a cached state can predate a Save made just
  // before leaving this page.
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const awaitingFreshState = iframeSrc === null && stateQuery.isFetching;
  if (ngState && baseUrl && iframeSrc === null && !stateQuery.isFetching) {
    setIframeSrc(constructNeuroglancerUrl(ngState, baseUrl));
  }
  const [relinkTarget, setRelinkTarget] = useState<RelinkTarget | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null
  );

  const { dirty } = editState;
  const canAddData = canEdit && bridge.status === 'ready';
  useEffect(() => {
    if (!dirty || !canEdit) {
      return;
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    // BrowserRouter has no useBlocker, so catch in-app link clicks (logo,
    // breadcrumb, profile menu) before React Router's Link handles them.
    // ponytail: same-origin <a> clicks only; browser back/forward and
    // programmatic navigation still leave without asking.
    const onLinkClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const link = (e.target as Element | null)?.closest?.('a[href]');
      if (
        !(link instanceof HTMLAnchorElement) ||
        (link.target && link.target !== '_self') ||
        link.hasAttribute('download') ||
        link.origin !== window.location.origin
      ) {
        return;
      }
      e.preventDefault();
      const to = link.pathname + link.search + link.hash;
      setPendingAction({ message: LEAVE_MESSAGE, run: () => navigate(to) });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onLinkClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onLinkClick, true);
    };
  }, [dirty, canEdit, navigate]);

  // Reflect the full state into the app's own URL hash so copy-pasting the
  // current page URL is a full-state shareable link, matching Neuroglancer's
  // own address-bar convention.
  // ponytail: hash is display/share only; if it should ever drive editable
  // state, that's the editable stack.
  useEffect(() => {
    if (!ngState) {
      return;
    }
    window.history.replaceState(
      window.history.state,
      '',
      '#!' + encodeURIComponent(JSON.stringify(ngState))
    );
  }, [ngState]);

  if (stateQuery.isPending || !baseUrl || awaitingFreshState) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Typography className="text-foreground">Loading View…</Typography>
      </div>
    );
  }

  // A failed background refetch keeps the cached state (and any unsaved edits).
  if (!ngState) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Typography className="text-foreground">View not found</Typography>
      </div>
    );
  }

  const title = ownedView?.name || (ngState.title as string) || 'Untitled View';
  const externalUrl = constructNeuroglancerUrl(ngState, baseUrl);

  // Owner with unsaved edits: ask first. Otherwise run on the saved state.
  const confirmUnsaved = (run: (state: NgState) => void) => {
    if (canEdit && dirty) {
      setPendingAction({ message: EXPORT_MESSAGE, run });
    } else {
      run(ngState);
    }
  };

  const handleCopy = async () => {
    const shortLink = `${window.location.origin}/view/${readKey}`;
    const result = await copyToClipboard(shortLink);
    if (result.success) {
      toast.success('View link copied');
    } else {
      toast.error(`Failed to copy: ${result.error}`);
    }
  };

  const handleFullscreen = () => {
    // ponytail: native Fullscreen API on the container, deliberately scoped
    // to this component (excluding the app navbar) rather than the whole
    // route; no custom fullscreen state machine.
    void containerRef.current?.requestFullscreen?.();
  };

  /** Resolves to the state that was saved, or null if the save failed. */
  const handleSave = async (): Promise<NgState | null> => {
    if (!ownedView) {
      return null;
    }
    try {
      // Inside the try: throws if Neuroglancer is mid-reload.
      const sent = bridge.getState();
      await updateViewMutation.mutateAsync({
        short_key: ownedView.short_key,
        ng_state: sent,
        ...(editState.pendingSources.length > 0 && {
          unsupported_sharing_keys: editState.pendingSources
        })
      });
      editState.markSaved(sent);
      toast.success('View saved');
      return sent;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
      return null;
    }
  };

  const saveThenRun = async (action: PendingAction) => {
    const sent = await handleSave();
    if (sent) {
      setPendingAction(null);
      action.run(sent);
    }
  };

  const handleRelinked = async () => {
    // The relink rewrote the saved state server-side; show it.
    const { data } = await stateQuery.refetch();
    if (!data) {
      return;
    }
    if (bridge.status === 'ready') {
      bridge.setState(data);
      editState.rebaseline();
    } else {
      setIframeSrc(constructNeuroglancerUrl(data, baseUrl));
    }
  };

  return (
    <div
      className="flex h-full w-full flex-col bg-background"
      ref={containerRef}
    >
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-surface px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link aria-label="Browse files" to="/browse">
            <LogoSvg />
          </Link>
          <div className="flex min-w-0 items-center gap-1 text-foreground/70">
            <FgLink className="font-semibold" to="/ngviews">
              Views
            </FgLink>
            <Typography>/</Typography>
            {ownedView ? (
              <InlineNameEditor
                className="truncate"
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
                typographyType="p"
                value={title}
              />
            ) : (
              <Typography className="truncate">{title}</Typography>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="flex items-center gap-1">
            {canAddData ? (
              <ToolbarIconButton
                icon={HiOutlinePlusCircle}
                label="Add data"
                onClick={() => setSidebarOpen(open => !open)}
                pressed={sidebarOpen}
              />
            ) : null}
            <ToolbarIconButton
              icon={HiOutlineShare}
              label="Copy link to share"
              onClick={() => confirmUnsaved(() => void handleCopy())}
            />
            <ToolbarIconButton
              icon={HiOutlineDownload}
              label="Download JSON"
              onClick={() =>
                confirmUnsaved(state =>
                  downloadTextFile(
                    JSON.stringify(state, null, 2),
                    `${title}.json`
                  )
                )
              }
            />
            <ToolbarIconButton
              icon={HiOutlineExternalLink}
              label="Open in Neuroglancer"
              onClick={() =>
                confirmUnsaved(state =>
                  window.open(
                    constructNeuroglancerUrl(state, baseUrl),
                    '_blank',
                    'noopener,noreferrer'
                  )
                )
              }
            />
            <ToolbarIconButton
              icon={HiOutlineArrowsExpand}
              label="Fullscreen"
              onClick={handleFullscreen}
            />
          </div>
          <FgTooltip label="Profile & settings">
            <ProfileMenu />
          </FgTooltip>
        </div>
      </div>
      {canEdit ? (
        <ViewSaveBar
          dirty={dirty}
          onDiscard={editState.discard}
          onSave={() => void handleSave()}
          saving={updateViewMutation.isPending}
          status={bridge.status}
        />
      ) : null}
      {canEdit && ownedView ? (
        <ViewBrokenBanner
          disabled={dirty}
          layers={ownedView.layers}
          onRelink={setRelinkTarget}
        />
      ) : null}
      <div className="flex min-h-0 flex-1">
        {canAddData && sidebarOpen ? (
          <ViewerSidebar
            bridge={bridge}
            onAddSources={editState.addSources}
            onClose={() => setSidebarOpen(false)}
            onEdited={editState.markEdited}
          />
        ) : null}
        <iframe
          className="h-full min-w-0 flex-1 border-0"
          ref={setIframe}
          src={iframeSrc ?? externalUrl}
          title="Neuroglancer viewer"
        />
      </div>
      {pendingAction ? (
        <UnsavedChangesDialog
          message={pendingAction.message}
          onClose={() => setPendingAction(null)}
          onContinue={() => {
            setPendingAction(null);
            pendingAction.run(ngState);
          }}
          onSave={() => void saveThenRun(pendingAction)}
          saving={updateViewMutation.isPending}
        />
      ) : null}
      {relinkTarget ? (
        <RelinkDialog
          onClose={() => setRelinkTarget(null)}
          onRelinked={() => void handleRelinked()}
          target={relinkTarget}
        />
      ) : null}
    </div>
  );
}
