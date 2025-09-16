import * as React from 'react';
import { Card, Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import { usePreferencesContext } from '@/contexts/PreferencesContext';

export default function Preferences() {
  const {
    pathPreference,
    handlePathPreferenceSubmit,
    hideDotFiles,
    toggleHideDotFiles,
    disableNeuroglancerStateGeneration,
    toggleDisableNeuroglancerStateGeneration,
    disableHeuristicalLayerTypeDetection,
    toggleDisableHeuristicalLayerTypeDetection
  } = usePreferencesContext();

  return (
    <>
      <Typography className="text-foreground pb-6" type="h5">
        Preferences
      </Typography>

      <Card className="min-h-max shrink-0">
        <Card.Header>
          <Typography className="font-semibold">
            Format to use for file paths:
          </Typography>
        </Card.Header>
        <Card.Body className="flex flex-col gap-4 pb-4">
          <div className="flex items-center gap-2">
            <input
              checked={pathPreference[0] === 'linux_path'}
              className="icon-small checked:accent-secondary-light"
              id="linux_path"
              onChange={async (event: React.ChangeEvent<HTMLInputElement>) => {
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
              onChange={async (event: React.ChangeEvent<HTMLInputElement>) => {
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
              onChange={async (event: React.ChangeEvent<HTMLInputElement>) => {
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
          <Typography className="font-semibold">Options:</Typography>
        </Card.Header>
        <Card.Body className="flex flex-col gap-4 pb-4">
          <div className="flex items-center gap-2">
            <input
              checked={hideDotFiles}
              className="icon-small checked:accent-secondary-light"
              id="hide_dot_files"
              onChange={async () => {
                const result = await toggleHideDotFiles();
                if (result.success) {
                  toast.success(
                    hideDotFiles
                      ? 'Dot files are now visible'
                      : 'Dot files are now hidden'
                  );
                } else {
                  toast.error(result.error);
                }
              }}
              type="checkbox"
            />
            <Typography
              as="label"
              className="text-foreground"
              htmlFor="hide_dot_files"
            >
              Hide dot files (files and folders starting with ".")
            </Typography>
          </div>

          <div className="flex items-center gap-2">
            <input
              checked={disableNeuroglancerStateGeneration}
              className="icon-small checked:accent-secondary-light"
              id="disable_neuroglancer_state_generation"
              onChange={async () => {
                const result = await toggleDisableNeuroglancerStateGeneration();
                if (result.success) {
                  toast.success(
                    disableNeuroglancerStateGeneration
                      ? 'Neuroglancer state generation is now enabled'
                      : 'Neuroglancer state generation is now disabled'
                  );
                } else {
                  toast.error(result.error);
                }
              }}
              type="checkbox"
            />
            <Typography
              as="label"
              className="text-foreground"
              htmlFor="disable_neuroglancer_state_generation"
            >
              Disable Neuroglancer state generation
            </Typography>
          </div>

          <div className="flex items-center gap-2">
            <input
              checked={disableHeuristicalLayerTypeDetection ?? false}
              className="icon-small checked:accent-secondary-light"
              id="disable_heuristical_layer_type_detection"
              onChange={async () => {
                const result =
                  await toggleDisableHeuristicalLayerTypeDetection();
                if (result.success) {
                  toast.success(
                    disableHeuristicalLayerTypeDetection
                      ? 'Heuristical layer type determination is now enabled'
                      : 'Heuristical layer type determination is now disabled'
                  );
                } else {
                  toast.error(result.error);
                }
              }}
              type="checkbox"
            />
            <Typography
              as="label"
              className="text-foreground"
              htmlFor="disable_heuristical_layer_type_detection"
            >
              Disable heuristical layer type determination
            </Typography>
          </div>
        </Card.Body>
      </Card>
    </>
  );
}
