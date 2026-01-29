import { useState } from 'react';
import { Button, Card, Typography } from '@material-tailwind/react';
import { HiOutlinePlus, HiOutlineKey } from 'react-icons/hi';

import { useSSHKeysQuery } from '@/queries/sshKeyQueries';
import type { TempKeyResult } from '@/queries/sshKeyQueries';
import SSHKeyCard from '@/components/ui/SSHKeys/SSHKeyCard';
import GenerateTempKeyDialog from '@/components/ui/SSHKeys/GenerateTempKeyDialog';
import TempKeyDialog from '@/components/ui/SSHKeys/TempKeyDialog';
import { Spinner } from '@/components/ui/widgets/Loaders';

export default function SSHKeys() {
  const [showGenerateTempDialog, setShowGenerateTempDialog] = useState(false);
  const [tempKeyResult, setTempKeyResult] = useState<TempKeyResult | null>(
    null
  );
  const { data, isLoading, error, refetch } = useSSHKeysQuery();

  const keys = data?.keys ?? [];
  const hasKeys = keys.length > 0;

  return (
    <>
      <Typography className="mb-6 text-foreground font-bold" type="h5">
        Authorized SSH Keys
      </Typography>

      <Typography className="mb-6 text-foreground">
        This page allows you to generate SSH keys and shows any keys you have
        already generated. Generated keys are tagged with 'fileglancer' and
        added to your
        <code>~/.ssh/authorized_keys</code> file. This interface does not allow
        you to remove keys from your
        <code>authorized_keys</code> file, but you can do so manually.
      </Typography>

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

      {!isLoading && !error && !hasKeys ? (
        <Card className="mb-6 p-8 text-center">
          <HiOutlineKey className="mx-auto h-12 w-12 text-secondary mb-4" />
          <Typography className="text-foreground font-semibold mb-2">
            No SSH keys found
          </Typography>
          <Typography className="text-secondary mb-4">
            Generate an SSH key to enable integration with Seqera Platform.
          </Typography>
          <Button
            color="primary"
            onClick={() => setShowGenerateTempDialog(true)}
            size="sm"
          >
            <HiOutlinePlus className="icon-default mr-1" />
            New Key
          </Button>
        </Card>
      ) : null}

      {!isLoading && !error && hasKeys ? (
        <div className="mb-6">
          <div className="mb-4">
            <Button
              color="primary"
              onClick={() => setShowGenerateTempDialog(true)}
              size="sm"
            >
              <HiOutlinePlus className="icon-default mr-1" />
              New Key
            </Button>
          </div>
          <div className="space-y-4">
            {keys.map(key => (
              <SSHKeyCard key={key.fingerprint} keyInfo={key} />
            ))}
          </div>
        </div>
      ) : null}

      <GenerateTempKeyDialog
        onKeyGenerated={setTempKeyResult}
        setShowDialog={setShowGenerateTempDialog}
        showDialog={showGenerateTempDialog}
      />

      <TempKeyDialog
        onClose={() => setTempKeyResult(null)}
        tempKeyResult={tempKeyResult}
      />
    </>
  );
}
