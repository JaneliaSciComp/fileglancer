import { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { Button, Typography } from '@material-tailwind/react';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import type { NGLink } from '@/queries/ngLinkQueries';

type CreatePayload = {
  url: string;
  short_name?: string;
  title?: string;
};

type UpdatePayload = {
  short_key: string;
  url: string;
  title?: string;
};

type NGLinkDialogProps = {
  readonly open: boolean;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onCreate?: (payload: CreatePayload) => Promise<void>;
  readonly onUpdate?: (payload: UpdatePayload) => Promise<void>;
  readonly editItem?: NGLink;
};

export default function NGLinkDialog({
  open,
  pending,
  onClose,
  onCreate,
  onUpdate,
  editItem
}: NGLinkDialogProps) {
  const isEditMode = !!editItem;

  const [neuroglancerUrl, setNeuroglancerUrl] = useState('');
  const [shortName, setShortName] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Initialize form values when editItem changes
  useEffect(() => {
    if (editItem) {
      setNeuroglancerUrl(editItem.neuroglancer_url);
      setShortName(editItem.short_name || '');
      setTitle(editItem.title || '');
    } else {
      setNeuroglancerUrl('');
      setShortName('');
      setTitle('');
    }
  }, [editItem]);

  const resetAndClose = () => {
    setError(null);
    setNeuroglancerUrl('');
    setShortName('');
    setTitle('');
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);

    if (!neuroglancerUrl.trim()) {
      setError('Please provide a Neuroglancer URL.');
      return;
    }

    if (isEditMode && onUpdate && editItem) {
      await onUpdate({
        short_key: editItem.short_key,
        url: neuroglancerUrl.trim(),
        title: title.trim() || undefined
      });
    } else if (onCreate) {
      await onCreate({
        url: neuroglancerUrl.trim(),
        short_name: shortName.trim() || undefined,
        title: title.trim() || undefined
      });
    }
  };

  return (
    <FgDialog onClose={resetAndClose} open={open}>
      <div className="mt-8 flex flex-col gap-2">
        <Typography className="text-foreground font-semibold" type="h6">
          {isEditMode
            ? 'Edit Neuroglancer link'
            : 'Create short Neuroglancer link'}
        </Typography>
        <Typography
          as="label"
          className="text-foreground font-semibold"
          htmlFor="neuroglancer-url"
        >
          Original Neuroglancer Link
        </Typography>
        <input
          autoFocus
          className="mb-4 p-2 text-foreground text-lg border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background"
          id="neuroglancer-url"
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setNeuroglancerUrl(e.target.value)
          }
          placeholder="https://neuroglancer-demo.appspot.com/#!{...}"
          type="text"
          value={neuroglancerUrl}
        />
        <Typography
          as="label"
          className="text-foreground font-semibold"
          htmlFor="title"
        >
          Title (optional, appears in tab name)
        </Typography>
        <input
          className="mb-4 p-2 text-foreground text-lg border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background"
          id="title"
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setTitle(e.target.value)
          }
          placeholder="Example: Hemibrain EM"
          type="text"
          value={title}
        />
        {!isEditMode ? (
          <>
            <Typography
              as="label"
              className="text-foreground font-semibold"
              htmlFor="short-name"
            >
              Name (optional, used in shortened link)
            </Typography>
            <input
              className="mb-4 p-2 text-foreground text-lg border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background"
              id="short-name"
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setShortName(e.target.value)
              }
              placeholder="Example: hemibrain-em-1"
              type="text"
              value={shortName}
            />
          </>
        ) : null}
        {error ? (
          <Typography className="text-error mb-4" type="small">
            {error}
          </Typography>
        ) : null}
      </div>
      <div className="flex gap-3">
        <Button
          className="!rounded-md"
          disabled={pending}
          onClick={handleSubmit}
        >
          {pending
            ? isEditMode
              ? 'Saving...'
              : 'Creating...'
            : isEditMode
              ? 'Save'
              : 'Create'}
        </Button>
        <Button
          className="!rounded-md"
          onClick={resetAndClose}
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </FgDialog>
  );
}
