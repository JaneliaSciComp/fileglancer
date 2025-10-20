import React from 'react';
import { Dialog, Button, Typography } from '@material-tailwind/react';
import { HiOutlineExclamationTriangle } from 'react-icons/hi2';
import { HiRefresh } from 'react-icons/hi';

type ServerDownOverlayProps = {
  readonly open: boolean;
  readonly onRetry: () => void;
  readonly countdownSeconds: number | null;
};

// Timer configuration constants
const COUNTDOWN_INTERVAL_MS = 1000; // 1 second intervals for countdown

// Helper components to reduce JSX nesting depth
function MessageContent(): JSX.Element {
  return (
    <div className="text-left space-y-2">
      <Typography className="text-foreground font-medium" type="small">
        What you can do:
      </Typography>
      <ul className="text-sm text-foreground space-y-1 list-disc list-inside">
        <li>Try again in a few moments</li>
        <li>
          Contact{' '}
          <a
            className="text-primary-light hover:underline focus:underline"
            href="mailto:support@hhmi.org"
          >
            support
          </a>{' '}
          if the issue persists
        </li>
      </ul>
    </div>
  );
}

function RetryButton({
  onRetry
}: {
  readonly onRetry: () => void;
}): JSX.Element {
  return (
    <Button
      autoFocus
      className="w-full flex items-center justify-center gap-2"
      color="primary"
      onClick={onRetry}
    >
      <HiRefresh className="w-4 h-4" />
      Try To Reconnect
    </Button>
  );
}

export function ServerDownOverlay({
  open,
  onRetry,
  countdownSeconds
}: ServerDownOverlayProps): JSX.Element {
  const [localCountdown, setLocalCountdown] = React.useState<number | null>(
    null
  );

  // Update local countdown when prop changes
  React.useEffect(() => {
    setLocalCountdown(countdownSeconds);
  }, [countdownSeconds]);

  const isCountdownActive = localCountdown !== null && localCountdown > 0;

  // Handle countdown timer - only restart when countdown becomes active
  React.useEffect(() => {
    if (!isCountdownActive) {
      return;
    }

    const timer = setInterval(() => {
      setLocalCountdown(prev => {
        if (prev === null || prev <= 1) {
          return null;
        }
        return prev - 1;
      });
    }, COUNTDOWN_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isCountdownActive]);

  return (
    <Dialog open={open}>
      <Dialog.Overlay className="bg-black/50">
        <Dialog.Content className="p-8 bg-surface-light max-w-md mx-auto">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="flex items-center justify-center w-16 h-16 bg-warning/10 rounded-full">
              <HiOutlineExclamationTriangle className="w-8 h-8 text-warning" />
            </div>

            <div className="space-y-2">
              <Typography
                className="text-surface-foreground font-bold"
                type="h5"
              >
                Server Unavailable
              </Typography>
              <Typography className="text-foreground" type="p">
                The Fileglancer server is currently down or unreachable.
              </Typography>
            </div>

            {localCountdown !== null && localCountdown > 0 ? (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 w-full">
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
                  <Typography className="text-primary font-medium" type="small">
                    Automatically retrying in {localCountdown} second
                    {localCountdown !== 1 ? 's' : ''}
                  </Typography>
                </div>
              </div>
            ) : null}

            <div className="space-y-4 w-full">
              <MessageContent />
              <RetryButton onRetry={onRetry} />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog>
  );
}
