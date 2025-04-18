import * as React from 'react';
import { Button, Card, Typography } from '@material-tailwind/react';
import { usePreferencesContext } from '../contexts/PreferencesContext';

export default function Preferences() {
  const {
    pathPreference,
    handlePathPreferenceChange,
    handlePathPreferenceSubmit
  } = usePreferencesContext();

  return (
    <div className="pt-12 w-4/5">
      <Typography type="h5" className="text-foreground text-lg pb-6">
        Preferences
      </Typography>

      <form onSubmit={event => handlePathPreferenceSubmit(event)}>
        <Card className="p-6">
          <Card.Header>
            <Typography className="font-semibold">
              Format to use for file paths:
            </Typography>
          </Card.Header>
          <Card.Body className="flex flex-col gap-4 pb-4">
            <div className="flex items-center gap-2">
              <input
                className="w-4 h-4 checked:accent-secondary-light"
                type="radio"
                id="linux_path"
                value="linux_path"
                checked={pathPreference[0] === 'linux_path'}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  handlePathPreferenceChange(event)
                }
              />

              <Typography
                as="label"
                htmlFor="linux_path"
                className="text-foreground"
              >
                Cluster/Linux (e.g., /misc/public)
              </Typography>
            </div>

            <div className="flex items-center gap-2">
              <input
                className="w-4 h-4 checked:accent-secondary-light"
                type="radio"
                id="windows_path"
                value="windows_path"
                checked={pathPreference[0] === 'windows_path'}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  handlePathPreferenceChange(event)
                }
              />
              <Typography
                as="label"
                htmlFor="windows_path"
                className="text-foreground"
              >
                Windows/Linux SMB (e.g. \\prfs.hhmi.org\public)
              </Typography>
            </div>

            <div className="flex items-center gap-2">
              <input
                className="w-4 h-4 checked:accent-secondary-light"
                type="radio"
                id="mac_path"
                value="mac_path"
                checked={pathPreference[0] === 'mac_path'}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  handlePathPreferenceChange(event)
                }
              />
              <Typography
                as="label"
                htmlFor="mac_path"
                className="text-foreground"
              >
                macOS (e.g. smb://prfs.hhmi.org/public)
              </Typography>
            </div>
          </Card.Body>
          <Card.Footer>
            <Button className="!rounded-md" type="submit">
              Submit
            </Button>
          </Card.Footer>
        </Card>
      </form>
    </div>
  );
}
