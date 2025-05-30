import * as React from 'react';
import { Alert, Button, Card, Typography } from '@material-tailwind/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import useLocalPathPreference from '@/hooks/useLocalPathPreference';

export default function Preferences() {
  const {
    showPathPrefAlert,
    setShowPathPrefAlert,
    handlePathPreferenceSubmit
  } = usePreferencesContext();
  const { localPathPreference, handleLocalChange } = useLocalPathPreference();

  React.useEffect(() => {
    setShowPathPrefAlert(false);
  }, [setShowPathPrefAlert]);

  return (
    <div className="pt-12 w-4/5">
      <Typography type="h5" className="text-foreground text-lg pb-6">
        Preferences
      </Typography>

      <form
        onSubmit={(event: React.FormEvent<HTMLFormElement>) =>
          handlePathPreferenceSubmit(event, localPathPreference)
        }
      >
        <Card className="p-6">
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
                checked={localPathPreference[0] === 'linux_path'}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  handleLocalChange(event);
                  setShowPathPrefAlert(false);
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
                checked={localPathPreference[0] === 'windows_path'}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  handleLocalChange(event);
                  setShowPathPrefAlert(false);
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
                checked={localPathPreference[0] === 'mac_path'}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  handleLocalChange(event);
                  setShowPathPrefAlert(false);
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
            <Button className="!rounded-md" type="submit">
              Submit
            </Button>
            {showPathPrefAlert === true ? (
              <Alert className="flex items-center gap-6 mt-6 bg-secondary-light/70 border-none">
                <Alert.Content>Preference updated!</Alert.Content>
                <XMarkIcon
                  className="icon-default cursor-pointer"
                  onClick={() => setShowPathPrefAlert(false)}
                />
              </Alert>
            ) : null}
          </Card.Footer>
        </Card>
      </form>
    </div>
  );
}
