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

  // Only show the id_ed25519 key
  const defaultKey = keys?.find(key => key.filename === 'id_ed25519');

  return (
    <>
      <div className="pb-6">
        <Typography className="text-foreground" type="h5">
          SSH Key
        </Typography>
      </div>

      <Card className="mb-6 p-4 bg-info/10 border border-info/20">
        <div className="flex gap-3">
          <HiOutlineInformationCircle className="icon-large text-info flex-shrink-0" />
          <Typography className="text-secondary text-sm">
            SSH keys allow you to securely connect to cluster nodes without
            entering a password. Specifically, you need an ed25519 SSH key to
            use Seqera Platform to run pipelines on the cluster. This page lets
            you view your existing ed25519 SSH key or generate a new one.
          </Typography>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner text="Loading SSH key..." />
        </div>
      ) : null}

      {error ? (
        <Card className="p-4 bg-error/10 border border-error/20">
          <Typography className="text-error">
            Failed to load SSH key: {error.message}
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

      {!isLoading && !error && !defaultKey ? (
        <Card className="mb-6 p-8 text-center">
          <HiOutlineKey className="mx-auto h-12 w-12 text-secondary mb-4" />
          <Typography className="text-foreground font-semibold mb-2">
            No SSH key found
          </Typography>
          <Typography className="text-secondary mb-4">
            Generate an ed25519 SSH key to enable passwordless access to cluster
            nodes and integration with Seqera Platform.
          </Typography>
          <Button onClick={() => setShowGenerateDialog(true)}>
            <HiOutlinePlus className="icon-default mr-1" />
            Generate SSH Key
          </Button>
        </Card>
      ) : null}

      {!isLoading && !error && defaultKey ? (
        <SSHKeyCard keyInfo={defaultKey} />
      ) : null}

      <GenerateKeyDialog
        setShowDialog={setShowGenerateDialog}
        showDialog={showGenerateDialog}
      />
    </>
  );
}
