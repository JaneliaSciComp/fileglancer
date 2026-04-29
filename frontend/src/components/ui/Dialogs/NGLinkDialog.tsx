import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Typography } from '@material-tailwind/react';

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
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgFormField from '@/components/designSystem/molecules/FgFormField';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import FgRadio from '@/components/designSystem/atoms/formElements/FgRadio';
import FgTextarea from '@/components/designSystem/atoms/formElements/FgTextarea';

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
  const urlInputRef = useRef<HTMLInputElement>(null);
  const shouldAutoSelectUrl = useRef(false);

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
      setNeuroglancerUrl(
        constructNeuroglancerUrl(editItem.state, editItem.url_base)
      );
      setShortName(editItem.short_name || '');
      setTitle(editItem.title || '');
      setStateJson(JSON.stringify(editItem.state, null, 2));
      setBaseUrl(editItem.url_base);
      setUrlValidationError(null);
      setStateValidationError(null);
      shouldAutoSelectUrl.current = true;
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

  // Auto-select the URL text once after it's populated in edit mode
  useEffect(() => {
    if (shouldAutoSelectUrl.current && urlInputRef.current) {
      urlInputRef.current.select();
      shouldAutoSelectUrl.current = false;
    }
  }, [neuroglancerUrl]);

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
    if (!isEditMode) {
      setNeuroglancerUrl('');
      setStateJson('');
      setBaseUrl(DEFAULT_BASE_URL);
    }
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
      return;
    }

    if (inputMode === 'url') {
      // URL Mode validation
      const urlError = validateUrlInput(neuroglancerUrl);
      if (urlError) {
        setUrlValidationError(urlError);
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
      const stateError = validateStateInput(stateJson);
      if (stateError) {
        setStateValidationError(stateError);
        return;
      }

      if (!baseUrl.trim()) {
        setError('Please provide a base URL.');
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
      <Typography className="text-foreground font-semibold text-lg mb-4">
        {isEditMode
          ? 'Edit Neuroglancer Short Link'
          : 'Create Neuroglancer Short Link'}
      </Typography>

      <div className="flex flex-col gap-2">
        {/* Mode Selector */}
        <div className="mb-4 flex gap-4">
          <FgRadio
            checked={inputMode === 'url'}
            id="mode-url"
            label="URL Mode"
            name="input-mode"
            onChange={() => handleModeChange('url')}
            value="url"
          />
          <FgRadio
            checked={inputMode === 'state'}
            id="mode-state"
            label="State Mode"
            name="input-mode"
            onChange={() => handleModeChange('state')}
            value="state"
          />
        </div>

        {/* URL Mode Fields */}
        {inputMode === 'url' ? (
          <FgFormField
            error={urlValidationError ?? undefined}
            htmlFor="neuroglancer-url"
            label="Neuroglancer URL"
          >
            <FgInput
              autoFocus
              id="neuroglancer-url"
              onChange={handleUrlChange}
              placeholder="https://neuroglancer-demo.appspot.com/#!{...}"
              ref={urlInputRef}
              size="lg"
              type="text"
              value={neuroglancerUrl}
            />
          </FgFormField>
        ) : null}

        {/* State Mode Fields */}
        {inputMode === 'state' ? (
          <>
            <FgFormField
              error={stateValidationError ?? undefined}
              htmlFor="state-json"
              label="JSON State"
            >
              <FgTextarea
                autoFocus
                className="font-mono"
                id="state-json"
                onChange={handleStateChange}
                placeholder='{"layers": [...], "position": [...]}'
                rows={6}
                value={stateJson}
              />
            </FgFormField>

            <FgFormField htmlFor="base-url" label="Neuroglancer Base URL">
              <FgInput
                id="base-url"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setBaseUrl(e.target.value)
                }
                placeholder="https://neuroglancer-demo.appspot.com/"
                size="lg"
                type="text"
                value={baseUrl}
              />
            </FgFormField>
          </>
        ) : null}

        {/* Title Field (shown in both modes) */}
        <FgFormField
          helperText="Appears in tab name"
          htmlFor="title"
          label="Title"
          optional
        >
          <FgInput
            id="title"
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setTitle(e.target.value)
            }
            placeholder="Example: Hemibrain EM"
            size="lg"
            type="text"
            value={title}
          />
        </FgFormField>

        {/* Short Name Field (only in create mode) */}
        {!isEditMode ? (
          <FgFormField
            error={shortNameError ?? undefined}
            helperText="Used in shortened link"
            htmlFor="short-name"
            label="Name"
            optional
          >
            <FgInput
              id="short-name"
              onChange={handleShortNameChange}
              placeholder="Example: hemibrain-em-1"
              size="lg"
              type="text"
              value={shortName}
            />
          </FgFormField>
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
        <FgButton
          disabled={pending}
          loading={pending}
          loadingText={isEditMode ? 'Saving...' : 'Creating...'}
          onClick={handleSubmit}
        >
          {isEditMode ? 'Save and copy link' : 'Create and copy link'}
        </FgButton>
        <FgButton onClick={resetAndClose} variant="ghost">
          Cancel
        </FgButton>
      </div>
    </FgDialog>
  );
}
