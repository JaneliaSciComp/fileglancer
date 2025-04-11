import * as React from 'react';
import {
  IconButton,
  ButtonGroup,
  Tooltip,
  Typography
} from '@material-tailwind/react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/solid';

export default function FileControlPanel({
  hideDotFiles,
  setHideDotFiles
}: {
  hideDotFiles: boolean;
  setHideDotFiles: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div className="flex flex-col min-w-full p-2 border-b border-surface">
      <ButtonGroup className="self-start">
        <Tooltip placement="top">
          <Tooltip.Trigger
            as={IconButton}
            variant="outline"
            onClick={() => setHideDotFiles((prev: boolean) => !prev)}
          >
            {hideDotFiles ? (
              <EyeSlashIcon className="h-5 w-5" />
            ) : (
              <EyeIcon className="h-5 w-5" />
            )}
            <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground">
              <Typography type="small" className="opacity-90">
                {hideDotFiles ? 'Show dot files' : 'Hide dot files'}
              </Typography>
              <Tooltip.Arrow />
            </Tooltip.Content>
          </Tooltip.Trigger>
        </Tooltip>
      </ButtonGroup>
    </div>
  );
}
