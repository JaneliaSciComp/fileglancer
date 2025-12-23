/* eslint-disable react/destructuring-assignment */
// Props are used for TypeScript type narrowing purposes and cannot be destructured at the beginning

import { useState } from 'react';
import { Button, Typography, Input, Textarea } from '@material-tailwind/react';
import toast from 'react-hot-toast';
import { HiClipboardCopy, HiExternalLink } from 'react-icons/hi';

import FgDialog from './FgDialog';
import {
  useCreateNgLinkMutation,
  useUpdateNgLinkMutation,
  useDeleteNgLinkMutation
} from '@/queries/ngLinkQueries';
import type { NeuroglancerLink } from '@/queries/ngLinkQueries';
import DeleteBtn from '@/components/ui/buttons/DeleteBtn';

interface CreateModeProps {
  mode: 'create';
  open: boolean;
  onClose: () => void;
}

interface EditModeProps {
  mode: 'edit';
  open: boolean;
  onClose: () => void;
  link: NeuroglancerLink;
}

interface DeleteModeProps {
  mode: 'delete';
  open: boolean;
  onClose: () => void;
  link: NeuroglancerLink;
}

type NeuroglancerLinkDialogProps =
  | CreateModeProps
  | EditModeProps
  | DeleteModeProps;

export default function NeuroglancerLinkDialog(
  props: NeuroglancerLinkDialogProps
) {
  const { mode, open, onClose } = props;
  const link = mode !== 'create' ? props.link : null;

  const [ngUrl, setNgUrl] = useState('');
  const [title, setTitle] = useState(link?.title || '');
  const [createdLink, setCreatedLink] = useState<NeuroglancerLink | null>(null);

  const createMutation = useCreateNgLinkMutation();
  const updateMutation = useUpdateNgLinkMutation();
  const deleteMutation = useDeleteNgLinkMutation();

  const handleCreate = async () => {
    if (!ngUrl.trim()) {
      toast.error('Please enter a Neuroglancer URL');
      return;
    }

    try {
      const result = await createMutation.mutateAsync({
        ng_url: ngUrl,
        title: title.trim() || undefined
      });
      setCreatedLink(result);
      toast.success('Neuroglancer link created!');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create link';
      toast.error(message);
    }
  };

  const handleUpdate = async () => {
    if (!link) {
      return;
    }

    try {
      await updateMutation.mutateAsync({
        short_key: link.short_key,
        title: title.trim() || null
      });
      toast.success('Link updated!');
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update link';
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!link) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({ short_key: link.short_key });
      toast.success('Link deleted!');
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete link';
      toast.error(message);
    }
  };

  const handleCopyShortUrl = async () => {
    const urlToCopy = createdLink?.short_url || link?.short_url;
    if (urlToCopy) {
      await navigator.clipboard.writeText(urlToCopy);
      toast.success('Short URL copied to clipboard!');
    }
  };

  const handleOpenLink = () => {
    const urlToOpen = createdLink?.short_url || link?.short_url;
    if (urlToOpen) {
      window.open(urlToOpen, '_blank');
    }
  };

  return (
    <FgDialog className="min-w-[500px]" onClose={onClose} open={open}>
      <div className="flex flex-col gap-4 my-4">
        {mode === 'create' && !createdLink ? (
          <>
            <Typography className="text-foreground font-bold" type="h6">
              Create Neuroglancer Link
            </Typography>
            <Typography className="text-foreground text-sm">
              Paste a Neuroglancer URL to create a short link. The URL should
              contain the viewer state in the fragment (after #!).
            </Typography>
            <div>
              <Typography
                className="text-foreground mb-1 font-medium"
                variant="small"
              >
                Neuroglancer URL *
              </Typography>
              <Textarea
                className="min-h-[100px] font-mono text-sm"
                onChange={e => setNgUrl(e.target.value)}
                placeholder="https://neuroglancer-demo.appspot.com/#!{...}"
                value={ngUrl}
              />
            </div>
            <div>
              <Typography
                className="text-foreground mb-1 font-medium"
                variant="small"
              >
                Title (optional)
              </Typography>
              <Input
                onChange={e => setTitle(e.target.value)}
                placeholder="My visualization"
                value={title}
              />
            </div>
            <div className="flex gap-4 mt-2">
              <Button
                className="!rounded-md"
                color="primary"
                disabled={createMutation.isPending || !ngUrl.trim()}
                onClick={handleCreate}
                variant="solid"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Link'}
              </Button>
              <Button
                className="!rounded-md"
                onClick={onClose}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </>
        ) : null}

        {mode === 'create' && createdLink ? (
          <>
            <Typography className="text-foreground font-bold" type="h6">
              Link Created!
            </Typography>
            <div>
              <Typography
                className="text-foreground mb-1 font-medium"
                variant="small"
              >
                Short URL
              </Typography>
              <div className="flex items-center gap-2 p-2 bg-surface rounded border border-outline">
                <Typography className="text-foreground font-mono text-sm flex-1 truncate">
                  {createdLink.short_url}
                </Typography>
                <Button
                  className="!rounded-md flex items-center gap-1"
                  color="secondary"
                  onClick={handleCopyShortUrl}
                  size="sm"
                  variant="ghost"
                >
                  <HiClipboardCopy className="icon-sm" />
                  Copy
                </Button>
                <Button
                  className="!rounded-md flex items-center gap-1"
                  color="secondary"
                  onClick={handleOpenLink}
                  size="sm"
                  variant="ghost"
                >
                  <HiExternalLink className="icon-sm" />
                  Open
                </Button>
              </div>
            </div>
            {createdLink.title ? (
              <div>
                <Typography
                  className="text-foreground mb-1 font-medium"
                  variant="small"
                >
                  Title
                </Typography>
                <Typography className="text-foreground">
                  {createdLink.title}
                </Typography>
              </div>
            ) : null}
            <div className="flex gap-4 mt-2">
              <Button
                className="!rounded-md"
                color="primary"
                onClick={onClose}
                variant="solid"
              >
                Done
              </Button>
            </div>
          </>
        ) : null}

        {mode === 'edit' && link ? (
          <>
            <Typography className="text-foreground font-bold" type="h6">
              Edit Neuroglancer Link
            </Typography>
            <div>
              <Typography
                className="text-foreground mb-1 font-medium"
                variant="small"
              >
                Short URL
              </Typography>
              <div className="flex items-center gap-2 p-2 bg-surface rounded border border-outline">
                <Typography className="text-foreground font-mono text-sm flex-1 truncate">
                  {link.short_url}
                </Typography>
                <Button
                  className="!rounded-md flex items-center gap-1"
                  color="secondary"
                  onClick={handleCopyShortUrl}
                  size="sm"
                  variant="ghost"
                >
                  <HiClipboardCopy className="icon-sm" />
                  Copy
                </Button>
              </div>
            </div>
            <div>
              <Typography
                className="text-foreground mb-1 font-medium"
                variant="small"
              >
                Title
              </Typography>
              <Input
                onChange={e => setTitle(e.target.value)}
                placeholder="My visualization"
                value={title}
              />
            </div>
            <div className="flex gap-4 mt-2">
              <Button
                className="!rounded-md"
                color="primary"
                disabled={updateMutation.isPending}
                onClick={handleUpdate}
                variant="solid"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                className="!rounded-md"
                onClick={onClose}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </>
        ) : null}

        {mode === 'delete' && link ? (
          <>
            <Typography className="text-foreground font-bold" type="h6">
              Delete Neuroglancer Link
            </Typography>
            <Typography className="text-foreground">
              Are you sure you want to delete this Neuroglancer link?
            </Typography>
            {link.title ? (
              <div className="p-3 bg-surface rounded border border-outline">
                <Typography className="text-foreground font-medium">
                  {link.title}
                </Typography>
                <Typography className="text-secondary text-sm font-mono truncate">
                  {link.short_url}
                </Typography>
              </div>
            ) : (
              <div className="p-3 bg-surface rounded border border-outline">
                <Typography className="text-foreground font-mono text-sm truncate">
                  {link.short_url}
                </Typography>
              </div>
            )}
            <Typography className="text-foreground text-sm">
              <span className="font-semibold">Warning:</span> Anyone with this
              short URL will no longer be able to access the Neuroglancer state.
            </Typography>
            <div className="flex gap-4 mt-2">
              <DeleteBtn
                disabled={deleteMutation.isPending}
                onClick={handleDelete}
                pending={deleteMutation.isPending}
              />
              <Button
                className="!rounded-md"
                onClick={onClose}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </FgDialog>
  );
}
