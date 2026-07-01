import { useState } from 'react';
import { Typography } from '@material-tailwind/react';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgFormField from '@/components/designSystem/molecules/FgFormField';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import FgCheckbox from '@/components/designSystem/atoms/formElements/FgCheckbox';
import { buildAppUrl, isGithubRepoUrl } from '@/utils';
import type { DiscoveredApp } from '@/shared.types';

interface AddAppDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onDiscover: (url: string) => Promise<DiscoveredApp[]>;
  readonly onAdd: (url: string, manifestPaths?: string[]) => Promise<void>;
  readonly discovering: boolean;
  readonly adding: boolean;
}

export default function AddAppDialog({
  open,
  onClose,
  onDiscover,
  onAdd,
  discovering,
  adding
}: AddAppDialogProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [urlError, setUrlError] = useState('');
  // Once a multi-app repo is discovered we move to a selection step.
  const [phase, setPhase] = useState<'input' | 'select'>('input');
  const [appUrl, setAppUrl] = useState('');
  const [discovered, setDiscovered] = useState<DiscoveredApp[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Apps that can still be added (not already in the user's list).
  const addable = discovered.filter(app => !app.already_added);
  const allSelected = addable.length > 0 && selected.size === addable.length;

  const resetState = () => {
    setRepoUrl('');
    setBranch('');
    setUrlError('');
    setPhase('input');
    setAppUrl('');
    setDiscovered([]);
    setSelected(new Set());
  };

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) {
      setUrlError('');
      return false;
    }
    if (!isGithubRepoUrl(url)) {
      setUrlError('Please enter a valid GitHub repository URL (HTTPS or SSH)');
      return false;
    }
    setUrlError('');
    return true;
  };

  // Step 1: discover the apps in the repo. A single-app repo is added straight
  // away; a multi-app repo advances to the checkbox selection step.
  const handleContinue = async () => {
    if (!validateUrl(repoUrl)) {
      return;
    }
    const url = buildAppUrl(repoUrl, branch);
    try {
      const apps = await onDiscover(url);
      if (apps.length <= 1) {
        await onAdd(url);
        resetState();
        return;
      }
      setAppUrl(url);
      setDiscovered(apps);
      setSelected(
        new Set(apps.filter(a => !a.already_added).map(a => a.manifest_path))
      );
      setUrlError('');
      setPhase('select');
    } catch (error) {
      setUrlError(
        error instanceof Error ? error.message : 'Failed to read repository'
      );
    }
  };

  // Step 2: add only the checked apps.
  const handleAddSelected = async () => {
    try {
      await onAdd(appUrl, Array.from(selected));
      resetState();
    } catch (error) {
      setUrlError(
        error instanceof Error ? error.message : 'Failed to add apps'
      );
    }
  };

  const toggleOne = (manifestPath: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(manifestPath)) {
        next.delete(manifestPath);
      } else {
        next.add(manifestPath);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(
      allSelected ? new Set() : new Set(addable.map(a => a.manifest_path))
    );
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const urlIsValid = repoUrl.trim() !== '' && isGithubRepoUrl(repoUrl);

  return (
    <FgDialog className="max-w-lg" onClose={handleClose} open={open}>
      {phase === 'input' ? (
        <>
          <Typography className="mb-4 text-foreground font-bold" type="h6">
            Add App
          </Typography>

          <Typography className="mb-2 text-foreground text-sm">
            Enter a GitHub repository URL (HTTPS or SSH) containing one or more{' '}
            <code>runnables.yaml</code> manifests. Private repositories are
            accessed over SSH using your configured SSH key.
          </Typography>

          <FgFormField
            error={urlError || undefined}
            htmlFor="repo-url"
            label="GitHub Repository URL"
          >
            <FgInput
              autoFocus
              onChange={e => {
                const value = e.target.value;
                setRepoUrl(value);
                validateUrl(value);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleContinue();
                }
              }}
              placeholder="https://github.com/org/repo or git@github.com:org/repo.git"
              type="text"
              value={repoUrl}
            />
          </FgFormField>

          <FgFormField
            helperText="Tag or branch name"
            htmlFor="branch"
            label="Revision"
            optional
          >
            <FgInput
              onChange={e => {
                setBranch(e.target.value);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleContinue();
                }
              }}
              placeholder="main"
              type="text"
              value={branch}
            />
          </FgFormField>

          <div className="flex gap-3">
            <FgButton
              disabled={!urlIsValid || discovering || adding}
              loading={discovering || adding}
              loadingText="Reading repository..."
              onClick={handleContinue}
            >
              Continue
            </FgButton>
            <FgButton onClick={handleClose} variant="ghost">
              Cancel
            </FgButton>
          </div>
        </>
      ) : (
        <>
          <Typography className="mb-1 text-foreground font-bold" type="h6">
            Select apps to add
          </Typography>
          <Typography className="mb-3 text-foreground text-sm">
            This repository contains {discovered.length} apps. Choose which ones
            to add.
          </Typography>

          <div className="mb-2 flex items-center justify-between">
            <Typography className="text-foreground text-sm font-medium">
              {selected.size} selected
            </Typography>
            <button
              className="text-primary text-sm hover:underline disabled:opacity-50 disabled:no-underline"
              disabled={addable.length === 0}
              onClick={toggleAll}
              type="button"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="mb-4 max-h-80 overflow-y-auto rounded border border-surface divide-y divide-surface">
            {discovered.map(app => {
              const cbId = `discover-${app.manifest_path || 'root'}`;
              return (
                <div
                  className="flex items-start gap-3 p-3"
                  key={app.manifest_path}
                >
                  <FgCheckbox
                    checked={
                      app.already_added || selected.has(app.manifest_path)
                    }
                    className="mt-0.5"
                    disabled={app.already_added}
                    hideLabel
                    id={cbId}
                    label={app.name}
                    onChange={() => toggleOne(app.manifest_path)}
                  />
                  <div className="min-w-0 flex-1">
                    <label
                      className={`text-foreground text-sm font-medium ${app.already_added ? 'cursor-default' : 'cursor-pointer'}`}
                      htmlFor={cbId}
                    >
                      {app.name}
                    </label>
                    {app.already_added ? (
                      <span className="ml-2 text-foreground text-xs">
                        (already added)
                      </span>
                    ) : null}
                    {app.description ? (
                      <p className="text-foreground text-xs mt-0.5 break-words">
                        {app.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {urlError ? (
            <Typography className="mb-3 text-error text-sm">
              {urlError}
            </Typography>
          ) : null}

          <div className="flex gap-3">
            <FgButton
              disabled={selected.size === 0 || adding}
              loading={adding}
              loadingText="Adding..."
              onClick={handleAddSelected}
            >
              {`Add Selected (${selected.size})`}
            </FgButton>
            <FgButton
              disabled={adding}
              onClick={() => {
                setPhase('input');
                setUrlError('');
              }}
              variant="ghost"
            >
              Back
            </FgButton>
            <FgButton disabled={adding} onClick={handleClose} variant="ghost">
              Cancel
            </FgButton>
          </div>
        </>
      )}
    </FgDialog>
  );
}
