import type { ChangeEvent } from 'react';
import { Card, Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import DataLinkOptions from '@/components/ui/PreferencesPage/DataLinkOptions';
import DisplayOptions from '@/components/ui/PreferencesPage/DisplayOptions';
import NeuroglancerOptions from '@/components/ui/PreferencesPage/NeuroglancerOptions';

export default function Preferences() {
  const { pathPreference, handlePathPreferenceSubmit } =
    usePreferencesContext();

  return (
    <>
      <Typography className="text-foreground pb-6" type="h5">
        Preferences
      </Typography>

      <Card className="min-h-max shrink-0">
        <Card.Header>
          <Typography className="font-semibold" type="lead">
            Format to use for file paths:
          </Typography>
        </Card.Header>
        <Card.Body className="flex flex-col gap-4 pb-4">
          <div className="flex items-center gap-2">
            <input
              checked={pathPreference[0] === 'linux_path'}
              className="icon-small checked:accent-secondary-light"
              id="linux_path"
              onChange={async (event: ChangeEvent<HTMLInputElement>) => {
                if (event.target.checked) {
                  const result = await handlePathPreferenceSubmit([
                    'linux_path'
                  ]);
                  if (result.success) {
                    toast.success('Path preference updated successfully!');
                  } else {
                    toast.error(result.error);
                  }
                }
              }}
              type="radio"
              value="linux_path"
            />

            <Typography
              as="label"
              className="text-foreground"
              htmlFor="linux_path"
            >
              Cluster/Linux (e.g., /misc/public)
            </Typography>
          </div>

          <div className="flex items-center gap-2">
            <input
              checked={pathPreference[0] === 'windows_path'}
              className="icon-small checked:accent-secondary-light"
              id="windows_path"
              onChange={async (event: ChangeEvent<HTMLInputElement>) => {
                if (event.target.checked) {
                  const result = await handlePathPreferenceSubmit([
                    'windows_path'
                  ]);
                  if (result.success) {
                    toast.success('Path preference updated successfully!');
                  } else {
                    toast.error(result.error);
                  }
                }
              }}
              type="radio"
              value="windows_path"
            />
            <Typography
              as="label"
              className="text-foreground"
              htmlFor="windows_path"
            >
              Windows/Linux SMB (e.g. \\prfs.hhmi.org\public)
            </Typography>
          </div>

          <div className="flex items-center gap-2">
            <input
              checked={pathPreference[0] === 'mac_path'}
              className="icon-small checked:accent-secondary-light"
              id="mac_path"
              onChange={async (event: ChangeEvent<HTMLInputElement>) => {
                if (event.target.checked) {
                  const result = await handlePathPreferenceSubmit(['mac_path']);
                  if (result.success) {
                    toast.success('Path preference updated successfully!');
                  } else {
                    toast.error(result.error);
                  }
                }
              }}
              type="radio"
              value="mac_path"
            />
            <Typography
              as="label"
              className="text-foreground"
              htmlFor="mac_path"
            >
              macOS (e.g. smb://prfs.hhmi.org/public)
            </Typography>
          </div>
        </Card.Body>
      </Card>

      <Card className="mt-6 min-h-max shrink-0">
        <Card.Header>
          <Typography className="font-semibold" type="lead">
            Options:
          </Typography>
        </Card.Header>
        <Card.Body className="flex flex-col gap-4 pb-4">
          <DisplayOptions />
          <DataLinkOptions />
          <NeuroglancerOptions />
        </Card.Body>
      </Card>
    </>
  );
}
