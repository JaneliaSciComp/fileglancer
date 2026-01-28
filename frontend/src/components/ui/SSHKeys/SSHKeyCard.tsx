import { Card, Typography } from '@material-tailwind/react';
import { HiOutlineKey } from 'react-icons/hi';

import type { SSHKeyInfo } from '@/queries/sshKeyQueries';

type SSHKeyCardProps = {
  readonly keyInfo: SSHKeyInfo;
};

export default function SSHKeyCard({ keyInfo }: SSHKeyCardProps) {
  return (
    <Card className="p-4 bg-surface-light">
      <div className="flex items-start gap-3">
        <HiOutlineKey className="icon-large text-secondary mt-1 flex-shrink-0" />
        <div className="min-w-0">
          <Typography className="font-semibold text-foreground truncate">
            {keyInfo.key_type}
          </Typography>
          <Typography className="text-xs text-secondary font-mono truncate">
            {keyInfo.fingerprint}
          </Typography>
        </div>
      </div>
    </Card>
  );
}
