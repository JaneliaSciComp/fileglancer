import { useState } from 'react';
import { Button, Card, Chip, Typography } from '@material-tailwind/react';
import { HiOutlineClipboardCopy, HiOutlineKey, HiOutlinePlus } from 'react-icons/hi';
import toast from 'react-hot-toast';

import { Spinner } from '@/components/ui/widgets/Loaders';
import { useAuthorizeSSHKeyMutation, fetchSSHKeyContent } from '@/queries/sshKeyQueries';
import type { SSHKeyInfo } from '@/queries/sshKeyQueries';

type SSHKeyCardProps = {
  readonly keyInfo: SSHKeyInfo;
};

export default function SSHKeyCard({ keyInfo }: SSHKeyCardProps) {
  const authorizeMutation = useAuthorizeSSHKeyMutation();
  const [isCopyingPublic, setIsCopyingPublic] = useState(false);
  const [isCopyingPrivate, setIsCopyingPrivate] = useState(false);

  // Truncate fingerprint for display
  const shortFingerprint =
    keyInfo.fingerprint.replace('SHA256:', '').slice(0, 16) + '...';

  const handleAuthorize = async () => {
    try {
      const result = await authorizeMutation.mutateAsync();
      toast.success(result.message);
    } catch (error) {
      toast.error(
        `Failed to authorize key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  const handleCopyPublicKey = async () => {
    setIsCopyingPublic(true);
    try {
      const content = await fetchSSHKeyContent('public');
      await navigator.clipboard.writeText(content.key);
      toast.success('Public key copied to clipboard');
    } catch (error) {
      toast.error(
        `Failed to copy public key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsCopyingPublic(false);
    }
  };

  const handleCopyPrivateKey = async () => {
    setIsCopyingPrivate(true);
    try {
      const content = await fetchSSHKeyContent('private');
      await navigator.clipboard.writeText(content.key);
      toast.success('Private key copied to clipboard');
    } catch (error) {
      toast.error(
        `Failed to copy private key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsCopyingPrivate(false);
    }
  };

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
              color="warning"
              disabled={authorizeMutation.isPending}
              onClick={handleAuthorize}
              size="sm"
              variant="outline"
            >
              {authorizeMutation.isPending ? (
                <Spinner customClasses="border-warning" text="Adding..." />
              ) : (
                <>
                  <HiOutlinePlus className="icon-default mr-1" />
                  Add to authorized_keys
                </>
              )}
            </Button>
          )}

          <Button
            color="primary"
            disabled={isCopyingPublic}
            onClick={handleCopyPublicKey}
            size="sm"
          >
            {isCopyingPublic ? (
              <Spinner text="Copying..." />
            ) : (
              <>
                <HiOutlineClipboardCopy className="icon-default mr-1" />
                Copy Public Key
              </>
            )}
          </Button>

          {keyInfo.has_private_key ? (
            <Button
              color="primary"
              disabled={isCopyingPrivate}
              onClick={handleCopyPrivateKey}
              size="sm"
            >
              {isCopyingPrivate ? (
                <Spinner text="Copying..." />
              ) : (
                <>
                  <HiOutlineClipboardCopy className="icon-default mr-1" />
                  Copy Private Key
                </>
              )}
            </Button>
          ) : (
            <Typography className="text-xs text-secondary italic">
              Private key not available
            </Typography>
          )}
        </div>
      </div>
    </Card>
  );
}
