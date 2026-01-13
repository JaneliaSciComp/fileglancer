import { useState } from 'react';
import { Button, Card, Typography } from '@material-tailwind/react';
import {
  HiOutlinePlus,
  HiOutlineKey,
  HiOutlineInformationCircle
} from 'react-icons/hi';

import { useSSHKeysQuery } from '@/queries/sshKeyQueries';
import SSHKeyCard from '@/components/ui/SSHKeys/SSHKeyCard';
import GenerateKeyDialog from '@/components/ui/SSHKeys/GenerateKeyDialog';
import { Spinner } from '@/components/ui/widgets/Loaders';

export default function SSHKeys() {
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const { data: keys, isLoading, error, refetch } = useSSHKeysQuery();

  // Check if the default key (id_ed25519) already exists
  const hasDefaultKey = keys?.some(key => key.filename === 'id_ed25519');

  return (
    <>
      <div className="pb-6">
        <Typography className="text-foreground" type="h5">
          SSH Keys
        </Typography>
      </div>

      <Card className="mb-6 p-4 bg-info/10 border border-info/20">
        <div className="flex gap-3">
          <HiOutlineInformationCircle className="icon-large text-info flex-shrink-0" />
          <div>
            <Typography className="font-semibold text-foreground mb-1">
              What are SSH keys?
            </Typography>
            <Typography className="text-secondary text-sm">
              SSH keys allow you to securely connect to cluster nodes without
              entering a password. When you generate a key, it is automatically
              added to your{' '}
              <span className="font-mono text-xs bg-surface px-1 rounded">
                authorized_keys
              </span>{' '}
              file, enabling SSH access to any node that shares your home
              directory.
            </Typography>
            <Typography className="text-secondary text-sm mt-2">
              To work with Seqera Platform, click{' '}
              <span className="font-semibold">Copy Private Key</span> and paste
              it into the Seqera Platform credentials settings.
            </Typography>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner text="Loading SSH keys..." />
        </div>
      ) : null}

      {error ? (
        <Card className="p-4 bg-error/10 border border-error/20">
          <Typography className="text-error">
            Failed to load SSH keys: {error.message}
          </Typography>
          <Button
            className="mt-2"
            color="error"
            onClick={() => refetch()}
            size="sm"
            variant="outline"
          >
            Retry
          </Button>
        </Card>
      ) : null}

      {!isLoading && !error && !hasDefaultKey ? (
        <Card className="mb-6 p-8 text-center">
          <HiOutlineKey className="mx-auto h-12 w-12 text-secondary mb-4" />
          <Typography className="text-foreground font-semibold mb-2">
            No ed25519 key found
          </Typography>
          <Typography className="text-secondary mb-4">
            Generate an ed25519 SSH key to enable passwordless access to cluster nodes
            and integration with Seqera Platform.
          </Typography>
          <Button onClick={() => setShowGenerateDialog(true)}>
            <HiOutlinePlus className="icon-default mr-1" />
            Generate SSH Key
          </Button>
        </Card>
      ) : null}

      {!isLoading && !error && keys && keys.length > 0 ? (
        <div className="space-y-4">
          {keys.map(key => (
            <SSHKeyCard key={key.fingerprint} keyInfo={key} />
          ))}
        </div>
      ) : null}

      <GenerateKeyDialog
        setShowDialog={setShowGenerateDialog}
        showDialog={showGenerateDialog}
      />
    </>
  );
}
