import { Card, Chip, Typography } from '@material-tailwind/react';
import { HiOutlineClipboardCopy, HiOutlineKey } from 'react-icons/hi';

import CopyTooltip from '@/components/ui/widgets/CopyTooltip';
import type { SSHKeyInfo } from '@/queries/sshKeyQueries';

type SSHKeyCardProps = {
  readonly keyInfo: SSHKeyInfo;
};

export default function SSHKeyCard({ keyInfo }: SSHKeyCardProps) {
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
          ) : null}

          <CopyTooltip
            primaryLabel="Copy SSH Public Key"
            textToCopy={keyInfo.public_key}
            tooltipTriggerClasses="!bg-primary hover:!bg-primary-dark !text-white"
          >
            <HiOutlineClipboardCopy className="icon-default mr-1" />
            Copy Public Key
          </CopyTooltip>

          {keyInfo.private_key ? (
            <CopyTooltip
              primaryLabel="Copy SSH Private Key"
              textToCopy={keyInfo.private_key}
              tooltipTriggerClasses="!bg-primary hover:!bg-primary-dark !text-white"
            >
              <HiOutlineClipboardCopy className="icon-default mr-1" />
              Copy Private Key
            </CopyTooltip>
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
