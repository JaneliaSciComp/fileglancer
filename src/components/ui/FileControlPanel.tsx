import * as React from 'react';
import {
  IconButton,
  ButtonGroup,
  Tooltip,
  Typography
} from '@material-tailwind/react';
import { Eye, EyeClosed, List } from 'iconoir-react';

type FileControlPanelProps = {
  hideDotFiles: boolean;
  setHideDotFiles: React.Dispatch<React.SetStateAction<boolean>>;
  setShowFileDrawer: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function FileControlPanel({
  hideDotFiles,
  setHideDotFiles,
  setShowFileDrawer
}: FileControlPanelProps) {
  return (
    <div className="flex flex-col min-w-full p-2 border-b border-surface">
      <ButtonGroup className="self-start">
        <Tooltip placement="top">
          <Tooltip.Trigger
            as={IconButton}
            variant="outline"
            onClick={() => setShowFileDrawer((prev: boolean) => !prev)}
          >
            <List className="h-5 w-5" />
            <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground">
              <Typography type="small" className="opacity-90">
                View file properties
              </Typography>
              <Tooltip.Arrow />
            </Tooltip.Content>
          </Tooltip.Trigger>
        </Tooltip>

        <Tooltip placement="top">
          <Tooltip.Trigger
            as={IconButton}
            variant="outline"
            onClick={() => setHideDotFiles((prev: boolean) => !prev)}
          >
            {hideDotFiles ? (
              <EyeClosed className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
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
