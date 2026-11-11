import { useState } from 'react';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';

import {
  useRemoveAppMutation,
  useRenameAppMutation,
  useShareAppMutation,
  useUnshareListingMutation,
  useUpdateAppMutation
} from '@/queries/appsQueries';
import { buildAppDetailPath, buildLaunchPathFromApp } from '@/utils';
import { showErrorToast } from '@/utils/errorToast';
import type { LaunchOrigin, UserApp } from '@/shared.types';

export interface AppActions {
  launch: (app: UserApp, entryPointId?: string) => void;
  view: (app: UserApp) => void;
  update: (app: UserApp) => Promise<void>;
  rename: (app: UserApp, name: string) => Promise<void>;
  requestRename: (app: UserApp) => void;
  renameTarget: UserApp | null;
  closeRename: () => void;
  renaming: boolean;
  requestUnshare: (app: UserApp) => void;
  confirmUnshare: () => Promise<void>;
  unshareTarget: UserApp | null;
  closeUnshare: () => void;
  share: (params: {
    url: string;
    manifest_path: string;
    name: string;
    description: string;
  }) => Promise<void>;
  requestShare: (app: UserApp) => void;
  requestRemove: (app: UserApp) => void;
  confirmRemove: () => Promise<void>;
  shareTarget: UserApp | null;
  removeTarget: UserApp | null;
  closeShare: () => void;
  closeRemove: () => void;
  updating: boolean;
  removing: boolean;
  sharing: boolean;
  unsharing: boolean;
}

/**
 * Navigation and mutation handlers for the actions offered on a user app
 * (launch, view details, share/unshare, update, rename, remove), shared by the
 * My Apps cards and the app detail page. Share, rename and remove are two-step flows: the
 * `request*` functions set a target app whose dialog is rendered by
 * `AppActionDialogs`.
 */
export function useAppActions(opts?: { onRemoved?: () => void }): AppActions {
  const navigate = useNavigate();
  const [shareTarget, setShareTarget] = useState<UserApp | null>(null);
  const [removeTarget, setRemoveTarget] = useState<UserApp | null>(null);
  const [unshareTarget, setUnshareTarget] = useState<UserApp | null>(null);
  const [renameTarget, setRenameTarget] = useState<UserApp | null>(null);

  const updateAppMutation = useUpdateAppMutation();
  const removeAppMutation = useRemoveAppMutation();
  const renameAppMutation = useRenameAppMutation();
  const shareAppMutation = useShareAppMutation();
  const unshareListingMutation = useUnshareListingMutation();

  const launch = (app: UserApp, entryPointId?: string) => {
    // Record the My Apps origin so the launch breadcrumbs link back here rather
    // than inferring the origin from install status.
    const from: LaunchOrigin = {
      homeTo: '/apps',
      homeLabel: 'My Apps',
      appTo: buildAppDetailPath(app.url, app.manifest_path)
    };
    navigate(buildLaunchPathFromApp(app.url, app.manifest_path, entryPointId), {
      state: { from }
    });
  };

  const view = (app: UserApp) => {
    navigate(buildAppDetailPath(app.url, app.manifest_path));
  };

  const update = async (app: UserApp) => {
    try {
      const updated = await updateAppMutation.mutateAsync({
        url: app.url,
        manifest_path: app.manifest_path
      });
      // Either repo may move: the app repo pin or (for manifests with a
      // separate repo_url) the code repo pin. A legacy app with no prior pin
      // can't be compared, so report a neutral success.
      const moved =
        updated.commit_sha !== app.commit_sha ||
        updated.code_commit_sha !== app.code_commit_sha;
      if (!app.commit_sha || !updated.commit_sha) {
        toast.success('App updated');
      } else if (!moved) {
        toast.success('Already up to date');
      } else {
        toast.success(`Updated to ${updated.commit_sha.slice(0, 7)}`);
      }
    } catch (error) {
      showErrorToast(error, 'Failed to update app');
    }
  };

  // Errors propagate so the rename dialog / inline editor can show them.
  const rename = async (app: UserApp, name: string) => {
    await renameAppMutation.mutateAsync({
      url: app.url,
      manifest_path: app.manifest_path,
      name
    });
    toast.success('App renamed');
  };

  const confirmUnshare = async () => {
    const app = unshareTarget;
    if (!app || app.listing_id === undefined || app.listing_id === null) {
      setUnshareTarget(null);
      return;
    }
    try {
      await unshareListingMutation.mutateAsync({ listing_id: app.listing_id });
      toast.success('Removed from catalog');
      setUnshareTarget(null);
    } catch (error) {
      showErrorToast(error, 'Failed to unshare');
    }
  };

  // Errors intentionally propagate so ShareAppDialog can show them inline.
  const share = async (params: {
    url: string;
    manifest_path: string;
    name: string;
    description: string;
  }) => {
    await shareAppMutation.mutateAsync(params);
    toast.success('Shared to catalog');
  };

  const confirmRemove = async () => {
    if (!removeTarget) {
      return;
    }
    try {
      await removeAppMutation.mutateAsync({
        url: removeTarget.url,
        manifest_path: removeTarget.manifest_path
      });
      toast.success('App removed');
      setRemoveTarget(null);
      opts?.onRemoved?.();
    } catch (error) {
      showErrorToast(error, 'Failed to remove app');
    }
  };

  return {
    launch,
    view,
    update,
    rename,
    requestRename: setRenameTarget,
    renameTarget,
    closeRename: () => setRenameTarget(null),
    renaming: renameAppMutation.isPending,
    requestUnshare: setUnshareTarget,
    confirmUnshare,
    unshareTarget,
    closeUnshare: () => setUnshareTarget(null),
    share,
    requestShare: setShareTarget,
    requestRemove: setRemoveTarget,
    confirmRemove,
    shareTarget,
    removeTarget,
    closeShare: () => setShareTarget(null),
    closeRemove: () => setRemoveTarget(null),
    updating: updateAppMutation.isPending,
    removing: removeAppMutation.isPending,
    sharing: shareAppMutation.isPending,
    unsharing: unshareListingMutation.isPending
  };
}
