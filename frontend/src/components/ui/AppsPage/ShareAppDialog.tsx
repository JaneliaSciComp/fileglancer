import { useEffect, useState } from 'react';
import { Typography } from '@material-tailwind/react';
import { FaUsers } from 'react-icons/fa6';

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
  const [shareError, setShareError] = useState('');

  // Prefill from the app each time the dialog is (re)opened.
  useEffect(() => {
    if (open && app) {
      setName(app.name);
      setDescription(app.description ?? '');
      setShareError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleShareSubmit = async () => {
    if (!app) {
      return;
    }
    if (!name.trim()) {
      setShareError('Name is required');
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
      setShareError(e instanceof Error ? e.message : 'Failed to share');
    }
  };

  return (
    <FgDialog className="max-w-2xl" onClose={onClose} open={open}>
      <Typography className="text-foreground font-bold mb-4 pr-8" type="h6">
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
            setShareError('');
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

      {shareError ? (
        <Typography className="text-error mb-3" type="small">
          {shareError}
        </Typography>
      ) : null}

      <div className="flex gap-3">
        <FgButton
          disabled={!name.trim() || sharing}
          icon={FaUsers}
          loading={sharing}
          loadingText="Sharing..."
          onClick={handleShareSubmit}
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
