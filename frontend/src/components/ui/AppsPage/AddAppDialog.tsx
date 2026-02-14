import { useState } from 'react';

import { Button, Typography } from '@material-tailwind/react';

import FgDialog from '@/components/ui/Dialogs/FgDialog';

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

  const handleAdd = async () => {
    if (!validateUrl(repoUrl)) {
      return;
    }
    const appUrl = buildAppUrl(repoUrl, branch);
    await onAdd(appUrl);
    setRepoUrl('');
    setBranch('');
    setUrlError('');
  };

  const handleClose = () => {
    setRepoUrl('');
    setBranch('');
    setUrlError('');
    onClose();
  };

  const urlIsValid = repoUrl.trim() !== '' && isValidGitHubUrl(repoUrl);

  return (
    <FgDialog className="max-w-lg" onClose={handleClose} open={open}>
      <Typography className="mb-4 text-foreground font-bold" type="h6">
        Add App
      </Typography>

      <Typography className="mb-2 text-foreground text-sm">
        Enter a GitHub repository URL containing a <code>runnables.yaml</code>{' '}
        manifest.
      </Typography>

      <div className="mb-3">
        <label className="block text-foreground text-sm font-medium mb-1">
          GitHub Repository URL
        </label>
        <input
          autoFocus
          className="w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary"
          onChange={e => {
            setRepoUrl(e.target.value);
            setUrlError('');
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              handleAdd();
            }
          }}
          placeholder="https://github.com/org/repo"
          type="text"
          value={repoUrl}
        />
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
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              handleAdd();
            }
          }}
          placeholder="main"
          type="text"
          value={branch}
        />
      </div>

      <div className="flex gap-3">
        <Button
          className="!rounded-md"
          disabled={!urlIsValid || adding}
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
