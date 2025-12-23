import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { Button, Input, Typography } from '@material-tailwind/react';

import FgDialog from '@/components/ui/Dialogs/FgDialog';

type NeuroglancerViewDialogProps = {
  readonly open: boolean;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onCreate: (payload: {
    url?: string;
    state?: Record<string, unknown>;
    url_base?: string;
    short_name?: string;
  }) => Promise<void>;
};

type InputMode = 'url' | 'state';

export default function NeuroglancerViewDialog({
  open,
  pending,
  onClose,
  onCreate
}: NeuroglancerViewDialogProps) {
  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [neuroglancerUrl, setNeuroglancerUrl] = useState('');
  const [stateJson, setStateJson] = useState('');
  const [urlBase, setUrlBase] = useState(
    'https://neuroglancer-demo.appspot.com/'
  );
  const [shortName, setShortName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resetAndClose = () => {
    setError(null);
    onClose();
  };

  const handleCreate = async () => {
    setError(null);

    if (inputMode === 'url') {
      if (!neuroglancerUrl.trim()) {
        setError('Please provide a Neuroglancer URL.');
        return;
      }
      await onCreate({
        url: neuroglancerUrl.trim(),
        short_name: shortName.trim() || undefined
      });
      return;
    }

    if (!stateJson.trim()) {
      setError('Please provide a Neuroglancer state JSON object.');
      return;
    }
    if (!urlBase.trim()) {
      setError('Please provide a Neuroglancer base URL.');
      return;
    }

    try {
      const parsed = JSON.parse(stateJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setError('State JSON must be a JSON object.');
        return;
      }
      await onCreate({
        state: parsed,
        url_base: urlBase.trim(),
        short_name: shortName.trim() || undefined
      });
    } catch {
      setError('State JSON must be valid JSON.');
    }
  };

  const handleInputModeChange = (mode: InputMode) => {
    setInputMode(mode);
    setError(null);
  };

  return (
    <FgDialog onClose={resetAndClose} open={open}>
      <div className="flex flex-col gap-4 my-4 w-[min(640px,90vw)]">
        <div className="flex items-center justify-between gap-4">
          <Typography className="text-foreground font-semibold" type="h6">
            Create Neuroglancer View
          </Typography>
          <div className="flex items-center gap-2">
            <Button
              className="!rounded-md"
              onClick={() => handleInputModeChange('url')}
              size="sm"
              variant={inputMode === 'url' ? 'outline' : 'ghost'}
            >
              URL
            </Button>
            <Button
              className="!rounded-md"
              onClick={() => handleInputModeChange('state')}
              size="sm"
              variant={inputMode === 'state' ? 'outline' : 'ghost'}
            >
              State JSON
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Typography className="text-foreground font-semibold" type="small">
            Short name (optional)
          </Typography>
          <Input
            className="bg-background text-foreground"
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setShortName(e.target.value)
            }
            placeholder="Example: Hemibrain view"
            value={shortName}
          />
        </div>

        {inputMode === 'url' ? (
          <div className="flex flex-col gap-2">
            <Typography className="text-foreground font-semibold" type="small">
              Neuroglancer URL
            </Typography>
            <Input
              className="bg-background text-foreground"
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setNeuroglancerUrl(e.target.value)
              }
              placeholder="https://neuroglancer-demo.appspot.com/#!{...}"
              value={neuroglancerUrl}
            />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Typography
                className="text-foreground font-semibold"
                type="small"
              >
                Neuroglancer base URL
              </Typography>
              <Input
                className="bg-background text-foreground"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setUrlBase(e.target.value)
                }
                placeholder="https://neuroglancer-demo.appspot.com/"
                value={urlBase}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Typography
                className="text-foreground font-semibold"
                type="small"
              >
                State JSON
              </Typography>
              <Input
                className="bg-background text-foreground"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setStateJson(e.target.value)
                }
                placeholder='{"layers":[...]}'
                value={stateJson}
              />
            </div>
          </>
        )}

        {error ? (
          <Typography className="text-error" type="small">
            {error}
          </Typography>
        ) : null}

        <div className="flex items-center gap-3">
          <Button
            className="!rounded-md bg-primary text-white hover:bg-primary/90"
            disabled={pending}
            onClick={handleCreate}
            variant="outline"
          >
            {pending ? 'Creating...' : 'Create View'}
          </Button>
          <Button
            className="!rounded-md"
            onClick={resetAndClose}
            variant="outline"
          >
            Cancel
          </Button>
        </div>
      </div>
    </FgDialog>
  );
}
