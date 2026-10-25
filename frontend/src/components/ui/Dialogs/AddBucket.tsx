import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Typography } from '@material-tailwind/react';

import FgDialog from './FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgFormField from '@/components/designSystem/molecules/FgFormField';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import FgSelect from '@/components/designSystem/atoms/formElements/FgSelect';
import {
  useCloudStorageConfigQuery,
  useCreateCloudBucketMutation
} from '@/queries/cloudStorageQueries';
import { makeBrowseLink } from '@/utils';
import { parseS3Url } from '@/utils/s3Url';

type AddBucketDialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
};

export default function AddBucketDialog({
  open,
  onClose
}: AddBucketDialogProps) {
  const navigate = useNavigate();
  const configQuery = useCloudStorageConfigQuery();
  const mutation = useCreateCloudBucketMutation();
  const [url, setUrl] = useState('');
  const [bucket, setBucket] = useState('');
  const [prefix, setPrefix] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [label, setLabel] = useState('');

  const config = configQuery.data;
  const endpointAllowed = config?.endpoint_url_allowed ?? false;
  const allowedEndpoints = config?.allowed_endpoints ?? null;
  const defaultLabel = [bucket, prefix.replace(/^\/+|\/+$/g, '')]
    .filter(Boolean)
    .join('/');

  const handleUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUrl(event.target.value);
    const parsed = parseS3Url(event.target.value);
    if (parsed) {
      setBucket(parsed.bucket);
      setPrefix(parsed.prefix);
      // Only apply an endpoint the rendered form can show and the user can change.
      const endpoint = parsed.endpointUrl ?? '';
      const usable =
        endpointAllowed &&
        (!allowedEndpoints || allowedEndpoints.includes(endpoint));
      setEndpointUrl(usable ? endpoint : '');
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate(
      {
        protocol: 's3',
        bucket,
        prefix: prefix || undefined,
        endpoint_url: endpointUrl || undefined,
        label: label || undefined
      },
      {
        onSuccess: created => {
          onClose();
          setUrl('');
          setBucket('');
          setPrefix('');
          setEndpointUrl('');
          setLabel('');
          navigate(makeBrowseLink(created.name));
        }
      }
    );
  };

  return (
    <FgDialog onClose={onClose} open={open}>
      <form onSubmit={submit}>
        <Typography className="text-foreground font-bold" type="h6">
          Add bucket
        </Typography>
        <div className="mt-4 flex flex-col gap-2">
          <FgFormField htmlFor="bucket_url" label="URL">
            <FgInput
              id="bucket_url"
              onChange={handleUrlChange}
              placeholder="Paste an s3:// or https:// URL to fill in the fields below"
              type="text"
              value={url}
            />
          </FgFormField>
          <FgFormField htmlFor="bucket_name" label="Bucket name">
            <FgInput
              id="bucket_name"
              onChange={e => setBucket(e.target.value)}
              required
              type="text"
              value={bucket}
            />
          </FgFormField>
          <FgFormField
            helperText="Browse only this folder of the bucket"
            htmlFor="bucket_prefix"
            label="Prefix"
          >
            <FgInput
              id="bucket_prefix"
              onChange={e => setPrefix(e.target.value)}
              type="text"
              value={prefix}
            />
          </FgFormField>
          {endpointAllowed ? (
            <FgFormField
              helperText="Leave empty for AWS S3"
              htmlFor="bucket_endpoint"
              label="Endpoint URL"
            >
              {allowedEndpoints ? (
                <FgSelect
                  id="bucket_endpoint"
                  onChange={e => setEndpointUrl(e.target.value)}
                  value={endpointUrl}
                >
                  <option value="">AWS S3</option>
                  {allowedEndpoints.map(endpoint => (
                    <option key={endpoint} value={endpoint}>
                      {endpoint}
                    </option>
                  ))}
                </FgSelect>
              ) : (
                <FgInput
                  id="bucket_endpoint"
                  onChange={e => setEndpointUrl(e.target.value)}
                  type="text"
                  value={endpointUrl}
                />
              )}
            </FgFormField>
          ) : null}
          <FgFormField htmlFor="bucket_label" label="Display name">
            <FgInput
              id="bucket_label"
              onChange={e => setLabel(e.target.value)}
              placeholder={defaultLabel}
              type="text"
              value={label}
            />
          </FgFormField>
        </div>
        {mutation.isError ? (
          <Typography className="text-error" role="alert" type="small">
            {mutation.error.message}
          </Typography>
        ) : null}
        <div className="mt-4 flex gap-2">
          <FgButton
            disabled={!bucket || mutation.isPending}
            loading={mutation.isPending}
            loadingText="Adding..."
            type="submit"
          >
            Add
          </FgButton>
          <FgButton onClick={onClose} type="button" variant="outline">
            Cancel
          </FgButton>
        </div>
      </form>
    </FgDialog>
  );
}
