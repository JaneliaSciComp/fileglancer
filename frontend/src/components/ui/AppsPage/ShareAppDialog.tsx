import { useEffect, useState } from 'react';
import { Typography } from '@material-tailwind/react';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';
import type { UserApp } from '@/shared.types';

interface ShareAppDialogProps {
  readonly app: UserApp | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onShare: (params: {
    url: string;
    manifest_path: string;
    name: string;
    description: string;
  }) => Promise<void>;
  readonly sharing: boolean;
}

export default function ShareAppDialog({
  app,
  open,
  onClose,
  onShare,
  sharing
}: ShareAppDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && app) {
      setName(app.name);
      setDescription(app.description ?? '');
      setError('');
    }
  }, [open, app]);

  const handleShare = async () => {
    if (!app || !name.trim()) {
      setError('Name is required');
      return;
    }
    try {
      await onShare({
        url: app.url,
        manifest_path: app.manifest_path,
        name: name.trim(),
        description: description.trim()
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to share');
    }
  };

  return (
    <FgDialog className="max-w-lg" onClose={onClose} open={open}>
      <Typography className="mb-4 text-foreground font-bold" type="h6">
        Share to Catalog
      </Typography>
      <Typography className="mb-4 text-foreground text-sm">
        Publish this app so other users can add it to their own collection. You
        can customize the name and description before sharing without affecting
        your own copy.
      </Typography>

      <div className="mb-3">
        <label className="block text-foreground text-sm font-medium mb-1">
          Name
        </label>
        <input
          autoFocus
          className="w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary"
          onChange={e => {
            setName(e.target.value);
            setError('');
          }}
          type="text"
          value={name}
        />
      </div>

      <div className="mb-4">
        <label className="block text-foreground text-sm font-medium mb-1">
          Description
          <span className="text-foreground font-normal ml-1">(optional)</span>
        </label>
        <textarea
          className="w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary"
          onChange={e => setDescription(e.target.value)}
          rows={3}
          value={description}
        />
      </div>

      {error ? (
        <Typography className="text-error mb-3" type="small">
          {error}
        </Typography>
      ) : null}

      <div className="flex gap-3">
        <FgButton
          disabled={!name.trim() || sharing}
          loading={sharing}
          loadingText="Sharing..."
          onClick={handleShare}
        >
          Share
        </FgButton>
        <FgButton onClick={onClose} variant="ghost">
          Cancel
        </FgButton>
      </div>
    </FgDialog>
  );
}
