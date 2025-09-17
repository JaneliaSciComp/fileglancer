import { Typography } from '@material-tailwind/react';

type TagProps = {
  readonly children: React.ReactNode;
  readonly classProps: string;
};

export default function Tag({ children, classProps }: TagProps) {
  return (
    <Typography
      className={`text-xs font-bold py-1 px-2 rounded-md ${classProps}`}
    >
      {children}
    </Typography>
  );
}
