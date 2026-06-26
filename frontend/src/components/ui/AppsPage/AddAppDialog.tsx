import { useState } from 'react';
import { Typography } from '@material-tailwind/react';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgFormField from '@/components/designSystem/molecules/FgFormField';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import { buildAppUrl, isGithubRepoUrl } from '@/utils';

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
    if (!isGithubRepoUrl(url)) {
      setUrlError('Please enter a valid GitHub repository URL (HTTPS or SSH)');
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
    try {
      await onAdd(appUrl);
      setRepoUrl('');
      setBranch('');
      setUrlError('');
    } catch (error) {
      setUrlError(error instanceof Error ? error.message : 'Failed to add app');
    }
  };

  const handleClose = () => {
    setRepoUrl('');
    setBranch('');
    setUrlError('');
    onClose();
  };

  const urlIsValid = repoUrl.trim() !== '' && isGithubRepoUrl(repoUrl);

  return (
    <FgDialog className="max-w-lg" onClose={handleClose} open={open}>
      <Typography className="mb-4 text-foreground font-bold" type="h6">
        Add App
      </Typography>

      <Typography className="mb-2 text-foreground text-sm">
        Enter a GitHub repository URL (HTTPS or SSH) containing a{' '}
        <code>runnables.yaml</code> manifest. Private repositories are accessed
        over SSH using your configured SSH key.
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
              handleAdd();
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
              handleAdd();
            }
          }}
          placeholder="main"
          type="text"
          value={branch}
        />
      </FgFormField>

      <div className="flex gap-3">
        <FgButton
          disabled={!urlIsValid || adding}
          loading={adding}
          loadingText="Adding..."
          onClick={handleAdd}
        >
          Add App
        </FgButton>
        <FgButton onClick={handleClose} variant="ghost">
          Cancel
        </FgButton>
      </div>
    </FgDialog>
  );
}
