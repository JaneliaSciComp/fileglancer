import { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { Button, Typography } from '@material-tailwind/react';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import type {
  NGLink,
  CreateNGLinkPayload,
  UpdateNGLinkPayload
} from '@/queries/ngLinkQueries';
import {
  parseNeuroglancerUrl,
  validateJsonState,
  constructNeuroglancerUrl
} from '@/utils';

type NGLinkDialogProps = {
  readonly open: boolean;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onCreate?: (payload: CreateNGLinkPayload) => Promise<void>;
  readonly onUpdate?: (payload: UpdateNGLinkPayload) => Promise<void>;
  readonly editItem?: NGLink;
};

const DEFAULT_BASE_URL = 'https://neuroglancer-demo.appspot.com/';

export default function NGLinkDialog({
  open,
  pending,
  onClose,
  onCreate,
  onUpdate,
  editItem
}: NGLinkDialogProps) {
  const isEditMode = !!editItem;

  const [inputMode, setInputMode] = useState<'url' | 'state'>('url');
  const [neuroglancerUrl, setNeuroglancerUrl] = useState('');
  const [stateJson, setStateJson] = useState('');
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [shortName, setShortName] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shortNameError, setShortNameError] = useState<string | null>(null);
  const [urlValidationError, setUrlValidationError] = useState<string | null>(
    null
  );
  const [stateValidationError, setStateValidationError] = useState<
    string | null
  >(null);

  // Initialize form values when editItem changes
  useEffect(() => {
    if (editItem) {
      setInputMode('url');
      setNeuroglancerUrl(editItem.neuroglancer_url);
      setShortName(editItem.short_name || '');
      setTitle(editItem.title || '');
      setStateJson('');
      setBaseUrl(DEFAULT_BASE_URL);
      setUrlValidationError(null);
      setStateValidationError(null);
    } else {
      setInputMode('url');
      setNeuroglancerUrl('');
      setShortName('');
      setTitle('');
      setStateJson('');
      setBaseUrl(DEFAULT_BASE_URL);
      setUrlValidationError(null);
      setStateValidationError(null);
    }
  }, [editItem]);

  const validateUrlInput = (value: string): string | null => {
    if (!value.trim()) {
      return 'Neuroglancer URL is required';
    }
    const result = parseNeuroglancerUrl(value);
    if (!result.success) {
      return result.error;
    }
    return null;
  };

  const validateStateInput = (value: string): string | null => {
    if (!value.trim()) {
      return 'JSON state is required';
    }
    const result = validateJsonState(value);
    if (!result.success) {
      return result.error;
    }
    return null;
  };

  const validateShortName = (value: string): string | null => {
    if (!value.trim()) {
      return null; // Empty is allowed (optional field)
    }
    // Only allow alphanumeric characters, hyphens, and underscores
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validPattern.test(value.trim())) {
      return 'Name can only contain letters, numbers, hyphens, and underscores';
    }
    return null;
  };

  const handleModeChange = (mode: 'url' | 'state') => {
    setInputMode(mode);
    setNeuroglancerUrl('');
    setStateJson('');
    setBaseUrl(DEFAULT_BASE_URL);
    setUrlValidationError(null);
    setStateValidationError(null);
    setError(null);
  };

  const handleUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNeuroglancerUrl(value);
    if (value.trim()) {
      setUrlValidationError(validateUrlInput(value));
    } else {
      setUrlValidationError(null);
    }
  };

  const handleStateChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setStateJson(value);
    if (value.trim()) {
      setStateValidationError(validateStateInput(value));
    } else {
      setStateValidationError(null);
    }
  };

  const handleShortNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setShortName(value);
    setShortNameError(validateShortName(value));
  };

  const resetAndClose = () => {
    setError(null);
    setShortNameError(null);
    setUrlValidationError(null);
    setStateValidationError(null);
    setInputMode('url');
    setNeuroglancerUrl('');
    setStateJson('');
    setBaseUrl(DEFAULT_BASE_URL);
    setShortName('');
    setTitle('');
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);

    // Check for short_name validation error
    if (shortNameError) {
      setError('Please fix the errors before submitting.');
      return;
    }

    if (inputMode === 'url') {
      // URL Mode validation
      if (!neuroglancerUrl.trim()) {
        setError('Please provide a Neuroglancer URL.');
        return;
      }

      const urlError = validateUrlInput(neuroglancerUrl);
      if (urlError) {
        setUrlValidationError(urlError);
        setError(urlError);
        return;
      }

      if (isEditMode && onUpdate && editItem) {
        await onUpdate({
          short_key: editItem.short_key,
          url: neuroglancerUrl.trim(),
          title: title.trim() || undefined
        });
      } else if (onCreate) {
        await onCreate({
          url: neuroglancerUrl.trim(),
          short_name: shortName.trim() || undefined,
          title: title.trim() || undefined
        });
      }
    } else {
      // State Mode validation
      if (!stateJson.trim()) {
        setError('Please provide JSON state.');
        return;
      }

      if (!baseUrl.trim()) {
        setError('Please provide a base URL.');
        return;
      }

      const stateError = validateStateInput(stateJson);
      if (stateError) {
        setStateValidationError(stateError);
        setError(stateError);
        return;
      }

      // Validate base URL
      if (
        !baseUrl.trim().startsWith('http://') &&
        !baseUrl.trim().startsWith('https://')
      ) {
        setError('Base URL must start with http:// or https://');
        return;
      }

      // Parse JSON state
      const parsedState = JSON.parse(stateJson.trim());

      if (isEditMode && onUpdate && editItem) {
        // For edit mode, construct URL from state and base URL
        const constructedUrl = constructNeuroglancerUrl(
          parsedState,
          baseUrl.trim()
        );
        await onUpdate({
          short_key: editItem.short_key,
          url: constructedUrl,
          title: title.trim() || undefined
        });
      } else if (onCreate) {
        await onCreate({
          state: parsedState,
          url_base: baseUrl.trim(),
          short_name: shortName.trim() || undefined,
          title: title.trim() || undefined
        });
      }
    }
  };

  return (
    <FgDialog onClose={resetAndClose} open={open}>
      <div className="mt-8 flex flex-col gap-2">
        <Typography className="text-foreground font-semibold" type="h6">
          {isEditMode
            ? 'Edit Neuroglancer Short Link'
            : 'Create Neuroglancer Short Link'}
        </Typography>

        {/* Mode Selector */}
        <div className="mb-4 flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              checked={inputMode === 'url'}
              className="cursor-pointer"
              name="input-mode"
              onChange={() => handleModeChange('url')}
              type="radio"
              value="url"
            />
            <Typography className="text-foreground font-semibold">
              URL Mode
            </Typography>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              checked={inputMode === 'state'}
              className="cursor-pointer"
              name="input-mode"
              onChange={() => handleModeChange('state')}
              type="radio"
              value="state"
            />
            <Typography className="text-foreground font-semibold">
              State Mode
            </Typography>
          </label>
        </div>

        {/* URL Mode Fields */}
        {inputMode === 'url' ? (
          <>
            <Typography
              as="label"
              className="text-foreground font-semibold"
              htmlFor="neuroglancer-url"
            >
              Neuroglancer URL
            </Typography>
            <input
              autoFocus
              className={`mb-1 p-2 text-foreground text-lg border rounded-sm focus:outline-none bg-background ${
                urlValidationError
                  ? 'border-error focus:border-error'
                  : 'border-primary-light focus:border-primary'
              }`}
              id="neuroglancer-url"
              onChange={handleUrlChange}
              placeholder="https://neuroglancer-demo.appspot.com/#!{...}"
              type="text"
              value={neuroglancerUrl}
            />
            {urlValidationError ? (
              <Typography className="text-error mb-4" type="small">
                {urlValidationError}
              </Typography>
            ) : (
              <div className="mb-4" />
            )}
          </>
        ) : null}

        {/* State Mode Fields */}
        {inputMode === 'state' ? (
          <>
            <Typography
              as="label"
              className="text-foreground font-semibold"
              htmlFor="state-json"
            >
              JSON State
            </Typography>
            <textarea
              autoFocus
              className={`mb-1 p-2 text-foreground text-lg border rounded-sm focus:outline-none bg-background font-mono ${
                stateValidationError
                  ? 'border-error focus:border-error'
                  : 'border-primary-light focus:border-primary'
              }`}
              id="state-json"
              onChange={handleStateChange}
              placeholder='{"layers": [...], "position": [...]}'
              rows={6}
              value={stateJson}
            />
            {stateValidationError ? (
              <Typography className="text-error mb-4" type="small">
                {stateValidationError}
              </Typography>
            ) : (
              <div className="mb-4" />
            )}

            <Typography
              as="label"
              className="text-foreground font-semibold"
              htmlFor="base-url"
            >
              Neuroglancer Base URL
            </Typography>
            <input
              className="mb-4 p-2 text-foreground text-lg border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background"
              id="base-url"
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setBaseUrl(e.target.value)
              }
              placeholder="https://neuroglancer-demo.appspot.com/"
              type="text"
              value={baseUrl}
            />
          </>
        ) : null}

        {/* Title Field (shown in both modes) */}
        <Typography
          as="label"
          className="text-foreground font-semibold"
          htmlFor="title"
        >
          Title (optional, appears in tab name)
        </Typography>
        <input
          className="mb-4 p-2 text-foreground text-lg border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background"
          id="title"
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setTitle(e.target.value)
          }
          placeholder="Example: Hemibrain EM"
          type="text"
          value={title}
        />

        {/* Short Name Field (only in create mode) */}
        {!isEditMode ? (
          <>
            <Typography
              as="label"
              className="text-foreground font-semibold"
              htmlFor="short-name"
            >
              Name (optional, used in shortened link)
            </Typography>
            <input
              className={`mb-1 p-2 text-foreground text-lg border rounded-sm focus:outline-none bg-background ${
                shortNameError
                  ? 'border-error focus:border-error'
                  : 'border-primary-light focus:border-primary'
              }`}
              id="short-name"
              onChange={handleShortNameChange}
              placeholder="Example: hemibrain-em-1"
              type="text"
              value={shortName}
            />
            {shortNameError ? (
              <Typography className="text-error mb-4" type="small">
                {shortNameError}
              </Typography>
            ) : (
              <div className="mb-4" />
            )}
          </>
        ) : null}

        {/* General Error Display */}
        {error ? (
          <Typography className="text-error mb-4" type="small">
            {error}
          </Typography>
        ) : null}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          className="!rounded-md"
          disabled={pending}
          onClick={handleSubmit}
        >
          {pending
            ? isEditMode
              ? 'Saving...'
              : 'Creating...'
            : isEditMode
              ? 'Save'
              : 'Create'}
        </Button>
        <Button
          className="!rounded-md"
          onClick={resetAndClose}
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </FgDialog>
  );
}
