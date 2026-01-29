import { useState } from 'react';
import { Button, Typography } from '@material-tailwind/react';
import {
  HiOutlineClipboardCopy,
  HiOutlineExclamation,
  HiOutlineCheck
} from 'react-icons/hi';
import toast from 'react-hot-toast';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import type { TempKeyResult } from '@/queries/sshKeyQueries';

type TempKeyDialogProps = {
  readonly tempKeyResult: TempKeyResult | null;
  readonly onClose: () => void;
};

export default function TempKeyDialog({
  tempKeyResult,
  onClose
}: TempKeyDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!tempKeyResult) {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tempKeyResult.privateKey);
      setCopied(true);
      toast.success('Private key copied to clipboard');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleClose = () => {
    setCopied(false);
    onClose();
  };

  // Truncate fingerprint for display
  const shortFingerprint =
    tempKeyResult.keyInfo.fingerprint.replace('SHA256:', '').slice(0, 16) +
    '...';

  return (
    <FgDialog onClose={handleClose} open={true}>
      <div className="flex items-center gap-2 mb-4">
        <HiOutlineExclamation className="text-warning h-6 w-6" />
        <Typography className="text-foreground font-semibold text-lg">
          SSH Key Generated
        </Typography>
      </div>

      <div className="space-y-4">
        <div className="p-3 bg-warning/10 border border-warning/20 rounded-md">
          <Typography className="text-warning font-semibold text-md">
            Copy this private key now - it will not be available again!
          </Typography>
          <Typography className="mt-1">
            The private key is not stored anywhere. You must copy it now by
            clicking the "Copy Private Key" button and then save it somewhere
            safe (e.g. paste it into Seqera Platform's 'Managed Identities'
            page).
          </Typography>
          <div className="flex justify-center mt-3">
            <Button
              color={copied ? 'success' : 'primary'}
              onClick={handleCopy}
              size="sm"
            >
              {copied ? (
                <>
                  <HiOutlineCheck className="icon-default mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <HiOutlineClipboardCopy className="icon-default mr-1" />
                  Copy Private Key
                </>
              )}
            </Button>
          </div>
        </div>

        <div>
          <Typography className="text-foreground font-semibold text-sm mb-1">
            Key Information
          </Typography>
          <div className="text-secondary text-sm space-y-1">
            <div>
              <span className="font-medium">Type:</span>{' '}
              {tempKeyResult.keyInfo.key_type}
            </div>
            <div>
              <span className="font-medium">Fingerprint:</span>{' '}
              <span className="font-mono">{shortFingerprint}</span>
            </div>
            <div>
              <span className="font-medium">Comment:</span>{' '}
              {tempKeyResult.keyInfo.comment}
            </div>
          </div>
        </div>

        <div className="flex justify-start pt-2">
          <Button onClick={handleClose} size="sm" variant="outline">
            Close
          </Button>
        </div>
      </div>
    </FgDialog>
  );
}
