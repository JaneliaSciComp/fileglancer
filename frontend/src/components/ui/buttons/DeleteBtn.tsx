import { Button, Typography } from '@material-tailwind/react';

import { Spinner } from '@/components/ui/widgets/Loaders';

export default function DeleteBtn({
  disabled,
  onClick,
  pending
}: {
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly pending: boolean;
}) {
  return (
    <Button
      className={`!rounded-md py-2 px-4 max-w-min ${pending ? 'cursor-not-allowed bg-error text-error-foreground' : ''}`}
      color="error"
      disabled={disabled}
      onClick={onClick}
      variant="outline"
    >
      {pending ? (
        <Spinner
          customClasses="!border-error-foreground text-error-foreground"
          text="Deleting..."
        />
      ) : (
        <Typography>Delete</Typography>
      )}
    </Button>
  );
}
