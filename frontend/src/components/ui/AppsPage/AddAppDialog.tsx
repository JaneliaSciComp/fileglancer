import { useState } from 'react';

import { Button, Typography } from '@material-tailwind/react';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import { useManifestPreviewMutation } from '@/queries/appsQueries';
import type { AppManifest } from '@/shared.types';

const GITHUB_URL_PATTERN = /^https?:\/\/github\.com\/[^/]+\/[^/]+\/?$/;

function isValidGitHubUrl(url: string): boolean {
  return GITHUB_URL_PATTERN.test(url.trim());
}

function buildAppUrl(repoUrl: string, branch: string): string {
  let url = repoUrl.trim().replace(/\/+$/, '');
  if (branch.trim()) {
    url += `/tree/${branch.trim()}`;
  }
  return url;
}

interface AddAppDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onAdd: (url: string) => Promise<void>;
  readonly adding: boolean;
}

export default function AddAppDialog({
  open,
  onClose,
  onAdd,
  adding
}: AddAppDialogProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [urlError, setUrlError] = useState('');
  const [preview, setPreview] = useState<AppManifest | null>(null);
  const manifestMutation = useManifestPreviewMutation();

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) {
      setUrlError('');
      return false;
    }
    if (!isValidGitHubUrl(url)) {
      setUrlError('Please enter a valid GitHub repository URL');
      return false;
    }
    setUrlError('');
    return true;
  };

  const handleFetchPreview = async () => {
    if (!validateUrl(repoUrl)) {
      return;
    }
    const appUrl = buildAppUrl(repoUrl, branch);
    try {
      const manifest = await manifestMutation.mutateAsync(appUrl);
      setPreview(manifest);
    } catch {
      setPreview(null);
    }
  };

  const handleAdd = async () => {
    const appUrl = buildAppUrl(repoUrl, branch);
    await onAdd(appUrl);
    setRepoUrl('');
    setBranch('');
    setUrlError('');
    setPreview(null);
  };

  const handleClose = () => {
    setRepoUrl('');
    setBranch('');
    setUrlError('');
    setPreview(null);
    manifestMutation.reset();
    onClose();
  };

  return (
    <FgDialog className="max-w-lg" onClose={handleClose} open={open}>
      <Typography className="mb-4 text-foreground font-bold" type="h6">
        Add App
      </Typography>

      <Typography className="mb-2 text-foreground text-sm">
        Enter a GitHub repository URL containing a{' '}
        <code>fileglancer-app.json</code> manifest.
      </Typography>

      <div className="mb-3">
        <label className="block text-foreground text-sm font-medium mb-1">
          GitHub Repository URL
        </label>
        <div className="flex gap-2">
          <input
            autoFocus
            className="flex-1 p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary"
            onChange={e => {
              setRepoUrl(e.target.value);
              setUrlError('');
              setPreview(null);
              manifestMutation.reset();
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleFetchPreview();
              }
            }}
            placeholder="https://github.com/org/repo"
            type="text"
            value={repoUrl}
          />
          <Button
            className="!rounded-md"
            disabled={!repoUrl.trim() || manifestMutation.isPending}
            onClick={handleFetchPreview}
            variant="outline"
          >
            {manifestMutation.isPending ? 'Checking...' : 'Preview'}
          </Button>
        </div>
        {urlError ? (
          <Typography className="text-error mt-1" type="small">
            {urlError}
          </Typography>
        ) : null}
      </div>

      <div className="mb-4">
        <label className="block text-foreground text-sm font-medium mb-1">
          Branch
          <span className="text-secondary font-normal ml-1">(optional)</span>
        </label>
        <input
          className="w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary"
          onChange={e => {
            setBranch(e.target.value);
            setPreview(null);
            manifestMutation.reset();
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              handleFetchPreview();
            }
          }}
          placeholder="main"
          type="text"
          value={branch}
        />
      </div>

      {manifestMutation.isError ? (
        <div className="mb-4 p-3 bg-error/10 rounded text-error text-sm">
          Failed to fetch manifest:{' '}
          {manifestMutation.error?.message || 'Unknown error'}
        </div>
      ) : null}

      {preview ? (
        <div className="mb-4 p-3 bg-surface/30 rounded border border-primary-light">
          <Typography className="text-foreground font-semibold" type="small">
            {preview.name}
          </Typography>
          {preview.description ? (
            <Typography className="text-secondary mt-1" type="small">
              {preview.description}
            </Typography>
          ) : null}
          {preview.version ? (
            <Typography className="text-secondary mt-1" type="small">
              Version: {preview.version}
            </Typography>
          ) : null}
          <Typography className="text-secondary mt-1" type="small">
            {preview.entryPoints.length} entry point
            {preview.entryPoints.length !== 1 ? 's' : ''}
          </Typography>
        </div>
      ) : null}

      <div className="flex gap-3">
        <Button
          className="!rounded-md"
          disabled={!preview || adding}
          onClick={handleAdd}
        >
          {adding ? 'Adding...' : 'Add App'}
        </Button>
        <Button className="!rounded-md" onClick={handleClose} variant="outline">
          Cancel
        </Button>
      </div>
    </FgDialog>
  );
}
