import { Typography } from '@material-tailwind/react';

export default function TextWithFilePath({
  text,
  path
}: {
  readonly text: string;
  readonly path: string;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2 mb-4">
      <Typography className="text-foreground font-semibold">{text}</Typography>
      <Typography className="text-foreground text-sm font-mono break-all">
        {path}
      </Typography>
    </div>
  );
}
