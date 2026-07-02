import { useState } from 'react';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';

import {
  useRemoveAppMutation,
  useShareAppMutation,
  useUnshareListingMutation,
  useUpdateAppMutation
} from '@/queries/appsQueries';
import { buildAppDetailPath, buildLaunchPathFromApp } from '@/utils';
import type { UserApp } from '@/shared.types';

export interface AppActions {
  launch: (app: UserApp, entryPointId?: string) => void;
  view: (app: UserApp) => void;
  update: (app: UserApp) => Promise<void>;
  unshare: (app: UserApp) => Promise<void>;
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
 * (launch, view details, share/unshare, update, remove), shared by the My Apps
 * cards and the app detail page. Share and remove are two-step flows: the
 * `request*` functions set a target app whose dialog is rendered by
 * `AppActionDialogs`.
 */
export function useAppActions(opts?: { onRemoved?: () => void }): AppActions {
  const navigate = useNavigate();
  const [shareTarget, setShareTarget] = useState<UserApp | null>(null);
  const [removeTarget, setRemoveTarget] = useState<UserApp | null>(null);

  const updateAppMutation = useUpdateAppMutation();
  const removeAppMutation = useRemoveAppMutation();
  const shareAppMutation = useShareAppMutation();
  const unshareListingMutation = useUnshareListingMutation();

  const launch = (app: UserApp, entryPointId?: string) => {
    navigate(buildLaunchPathFromApp(app.url, app.manifest_path, entryPointId));
  };

  const view = (app: UserApp) => {
    navigate(buildAppDetailPath(app.url, app.manifest_path));
  };

  const update = async (app: UserApp) => {
    try {
      await updateAppMutation.mutateAsync({
        url: app.url,
        manifest_path: app.manifest_path
      });
      toast.success('App updated');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update app';
      toast.error(message);
    }
  };

  const unshare = async (app: UserApp) => {
    if (app.listing_id === undefined || app.listing_id === null) {
      return;
    }
    try {
      await unshareListingMutation.mutateAsync({ listing_id: app.listing_id });
      toast.success('Removed from catalog');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to unshare';
      toast.error(message);
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
      const message =
        error instanceof Error ? error.message : 'Failed to remove app';
      toast.error(message);
    }
  };

  return {
    launch,
    view,
    update,
    unshare,
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
