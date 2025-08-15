import * as React from 'react';
import { Button, Card, Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import useLocalPathPreference from '@/hooks/useLocalPathPreference';

export default function Preferences() {
  const { pathPreference, handlePathPreferenceSubmit } =
    usePreferencesContext();
  const { localPathPreference, handleLocalChange } = useLocalPathPreference();

  return (
    <>
      <Typography type="h5" className="text-foreground pb-6">
        Preferences
      </Typography>

      <form
        onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const result = await handlePathPreferenceSubmit(localPathPreference);
          if (result.success) {
            toast.success('Path preference updated successfully!');
          } else {
            toast.error(result.error);
          }
        }}
      >
        <Card>
          <Card.Header>
            <Typography className="font-semibold">
              Format to use for file paths:
            </Typography>
          </Card.Header>
          <Card.Body className="flex flex-col gap-4 pb-4">
            <div className="flex items-center gap-2">
              <input
                className="icon-small checked:accent-secondary-light"
                type="radio"
                id="linux_path"
                value="linux_path"
                checked={
                  localPathPreference && localPathPreference[0] === 'linux_path'
                }
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  handleLocalChange(event);
                }}
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
                className="icon-small checked:accent-secondary-light"
                type="radio"
                id="windows_path"
                value="windows_path"
                checked={
                  localPathPreference &&
                  localPathPreference[0] === 'windows_path'
                }
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  handleLocalChange(event);
                }}
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
                className="icon-small checked:accent-secondary-light"
                type="radio"
                id="mac_path"
                value="mac_path"
                checked={
                  localPathPreference && localPathPreference[0] === 'mac_path'
                }
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  handleLocalChange(event);
                }}
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
            <Button
              className="!rounded-md"
              type="submit"
              disabled={
                localPathPreference &&
                localPathPreference[0] === pathPreference[0]
              }
            >
              Submit
            </Button>
          </Card.Footer>
        </Card>
      </form>
    </>
  );
}
