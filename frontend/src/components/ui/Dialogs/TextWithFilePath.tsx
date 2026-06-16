import { Typography } from '@material-tailwind/react';

export default function TextWithFilePath({
  text,
  path
}: {
  readonly text: string;
  readonly path: string;
}) {
  return (
    <div className="flex flex-col gap-2 mb-[1.5rem]">
      <Typography className="block text-foreground text-sm font-semibold mb-1">
        {text}
      </Typography>
      <Typography className="text-foreground text-sm font-mono break-all">
        {path}
      </Typography>
    </div>
  );
}
