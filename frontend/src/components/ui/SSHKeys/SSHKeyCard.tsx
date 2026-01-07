import { useState } from 'react';
import { Button, Card, Chip, IconButton, Typography } from '@material-tailwind/react';
import {
  HiOutlineClipboardCopy,
  HiOutlineKey,
  HiOutlineTrash
} from 'react-icons/hi';
import toast from 'react-hot-toast';

import CopyTooltip from '@/components/ui/widgets/CopyTooltip';
import DeleteSSHKeyDialog from '@/components/ui/SSHKeys/DeleteSSHKeyDialog';
import { Spinner } from '@/components/ui/widgets/Loaders';
import { useAuthorizeSSHKeyMutation } from '@/queries/sshKeyQueries';
import type { SSHKeyInfo } from '@/queries/sshKeyQueries';

type SSHKeyCardProps = {
  readonly keyInfo: SSHKeyInfo;
};

export default function SSHKeyCard({ keyInfo }: SSHKeyCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const authorizeMutation = useAuthorizeSSHKeyMutation();

  const handleAuthorize = async () => {
    try {
      await authorizeMutation.mutateAsync({ key_name: keyInfo.filename });
      toast.success(`Key "${keyInfo.filename}" added to authorized_keys`);
    } catch (error) {
      toast.error(
        `Failed to authorize key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  // Truncate fingerprint for display
  const shortFingerprint =
    keyInfo.fingerprint.replace('SHA256:', '').slice(0, 16) + '...';

  return (
    <Card className="p-4 bg-surface-light">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <HiOutlineKey className="icon-large text-secondary mt-1 flex-shrink-0" />
          <div className="min-w-0">
            <Typography className="font-semibold text-foreground truncate">
              {keyInfo.filename}
            </Typography>
            <Typography className="text-sm text-secondary">
              {keyInfo.key_type}
            </Typography>
            <Typography className="text-xs text-secondary font-mono">
              {shortFingerprint}
            </Typography>
            {keyInfo.comment ? (
              <Typography className="text-xs text-secondary truncate">
                {keyInfo.comment}
              </Typography>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {keyInfo.is_authorized ? (
            <Chip color="success" size="sm" variant="ghost">
              Authorized
            </Chip>
          ) : (
            <Button
              disabled={authorizeMutation.isPending}
              onClick={handleAuthorize}
              size="sm"
              variant="outline"
            >
              {authorizeMutation.isPending ? (
                <Spinner text="Adding..." />
              ) : (
                'Add to authorized_keys'
              )}
            </Button>
          )}

          {keyInfo.private_key ? (
            <CopyTooltip
              primaryLabel="Copy SSH Private Key"
              textToCopy={keyInfo.private_key}
              tooltipTriggerClasses="!bg-primary hover:!bg-primary-dark !text-white"
            >
              <HiOutlineClipboardCopy className="icon-default mr-1" />
              Copy SSH Private Key
            </CopyTooltip>
          ) : (
            <Typography className="text-xs text-secondary italic">
              Private key not available
            </Typography>
          )}

          <IconButton
            color="error"
            onClick={() => setShowDeleteDialog(true)}
            size="sm"
            variant="ghost"
          >
            <HiOutlineTrash className="icon-default" />
          </IconButton>
        </div>
      </div>

      <DeleteSSHKeyDialog
        keyInfo={keyInfo}
        setShowDialog={setShowDeleteDialog}
        showDialog={showDeleteDialog}
      />
    </Card>
  );
}
