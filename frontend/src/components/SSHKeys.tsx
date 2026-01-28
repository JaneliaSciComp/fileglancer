import { useState } from 'react';
import { Button, Card, Input, Typography } from '@material-tailwind/react';
import {
  HiOutlinePlus,
  HiOutlineKey,
  HiOutlineInformationCircle,
  HiOutlineExclamation,
  HiOutlineRefresh
} from 'react-icons/hi';
import toast from 'react-hot-toast';

import {
  useSSHKeysQuery,
  useRegeneratePublicKeyMutation
} from '@/queries/sshKeyQueries';
import type { TempKeyResult } from '@/queries/sshKeyQueries';
import SSHKeyCard from '@/components/ui/SSHKeys/SSHKeyCard';
import GenerateKeyDialog from '@/components/ui/SSHKeys/GenerateKeyDialog';
import GenerateTempKeyDialog from '@/components/ui/SSHKeys/GenerateTempKeyDialog';
import TempKeyDialog from '@/components/ui/SSHKeys/TempKeyDialog';
import { Spinner } from '@/components/ui/widgets/Loaders';

export default function SSHKeys() {
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showGenerateTempDialog, setShowGenerateTempDialog] = useState(false);
  const [tempKeyResult, setTempKeyResult] = useState<TempKeyResult | null>(
    null
  );
  const [regeneratePassphrase, setRegeneratePassphrase] = useState('');
  const { data, isLoading, error, refetch } = useSSHKeysQuery();
  const regenerateMutation = useRegeneratePublicKeyMutation();

  const handleRegenerate = async () => {
    try {
      await regenerateMutation.mutateAsync(
        regeneratePassphrase ? { passphrase: regeneratePassphrase } : undefined
      );
      setRegeneratePassphrase('');
      toast.success('Public key regenerated successfully');
    } catch (err) {
      toast.error(
        `Failed to regenerate public key: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  const keys = data?.keys ?? [];
  const hasKeys = keys.length > 0;
  const unmanagedExists = data?.unmanaged_id_ed25519_exists ?? false;
  const id_ed25519_exists = data?.id_ed25519_exists ?? false;
  const id_ed25519_missing_pubkey = data?.id_ed25519_missing_pubkey ?? false;
  // Can generate permanent key if id_ed25519 doesn't exist at all
  const canGeneratePermanentKey = !unmanagedExists && !id_ed25519_exists;

  return (
    <>
      <div className="pb-6">
        <Typography className="text-foreground" type="h5">
          Fileglancer-managed SSH Keys
        </Typography>
      </div>

      <Card className="mb-6 p-4 bg-info/10 border border-info/20">
        <div className="flex gap-3">
          <HiOutlineInformationCircle className="icon-large text-info flex-shrink-0" />
          <Typography className="text-secondary text-sm">
            Fileglancer-managed SSH keys allow you to securely connect to
            cluster nodes without entering a password. Specifically, you need an
            ed25519 SSH key to use Seqera Platform to run pipelines on the
            cluster. This page allows you to generate keys for use with Seqera Platform.
            Generated keys are added to your authorized_keys file.
          </Typography>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner text="Loading Fileglancer-managed SSH keys..." />
        </div>
      ) : null}

      {error ? (
        <Card className="p-4 bg-error/10 border border-error/20">
          <Typography className="text-error">
            Failed to load Fileglancer-managed SSH keys: {error.message}
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

      {!isLoading && !error && id_ed25519_missing_pubkey ? (
        <Card className="mb-6 p-4 bg-warning/10 border border-warning/20">
          <div className="flex gap-3">
            <HiOutlineExclamation className="icon-large text-warning flex-shrink-0" />
            <div className="flex-1">
              <Typography className="text-foreground font-semibold mb-1">
                Public key missing for id_ed25519
              </Typography>
              <Typography className="text-secondary text-sm mb-3">
                The id_ed25519 private key exists and is managed by Fileglancer,
                but the public key file is missing. You can regenerate it below.
              </Typography>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  className="flex-1"
                  disabled={regenerateMutation.isPending}
                  onChange={e => setRegeneratePassphrase(e.target.value)}
                  placeholder="Passphrase (if key is encrypted)"
                  type="password"
                  value={regeneratePassphrase}
                />
                <Button
                  className="flex-shrink-0"
                  disabled={regenerateMutation.isPending}
                  onClick={handleRegenerate}
                >
                  <HiOutlineRefresh className="icon-default mr-1" />
                  {regenerateMutation.isPending
                    ? 'Regenerating...'
                    : 'Regenerate Public Key'}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {!isLoading && !error && !hasKeys ? (
        <Card className="mb-6 p-8 text-center">
          <HiOutlineKey className="mx-auto h-12 w-12 text-secondary mb-4" />
          <Typography className="text-foreground font-semibold mb-2">
            No Fileglancer-managed SSH key found
          </Typography>
          <Typography className="text-secondary mb-4">
            Generate an ed25519 SSH key to enable passwordless access to cluster
            nodes and integration with Seqera Platform.
          </Typography>
        </Card>
      ) : null}

      {!isLoading && !error && hasKeys ? (
        <div className="space-y-4 mb-6">
          {keys.map(key => (
            <SSHKeyCard key={key.fingerprint} keyInfo={key} />
          ))}
        </div>
      ) : null}

      {!isLoading && !error && canGeneratePermanentKey ? (
        <Card className="mb-6 p-4 bg-surface-light">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <Typography className="text-foreground font-semibold">
                Generate Permanent Key
              </Typography>
              <Typography className="text-secondary text-sm">
                Creates the default id_ed25519 key pair in your ~/.ssh directory
                and adds it to authorized_keys. The private key is stored on the
                server.
              </Typography>
            </div>
            <Button
              className="flex-shrink-0"
              onClick={() => setShowGenerateDialog(true)}
            >
              <HiOutlinePlus className="icon-default mr-1" />
              Generate Permanent Key
            </Button>
          </div>
        </Card>
      ) : null}

      {!isLoading && !error ? (
        <Card className="mb-6 p-4 bg-surface-light">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <Typography className="text-foreground font-semibold">
                Generate Temporary Key
              </Typography>
              <Typography className="text-secondary text-sm">
                Creates a key that is added to authorized_keys. The private key
                is shown once for you to copy - it is not stored on the server.
              </Typography>
            </div>
            <Button
              className="flex-shrink-0"
              onClick={() => setShowGenerateTempDialog(true)}
              variant="outline"
            >
              <HiOutlinePlus className="icon-default mr-1" />
              Generate Temporary Key
            </Button>
          </div>
        </Card>
      ) : null}

      <GenerateKeyDialog
        setShowDialog={setShowGenerateDialog}
        showDialog={showGenerateDialog}
      />

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
