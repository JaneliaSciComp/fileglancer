import { Typography } from '@material-tailwind/react';

type TagProps = {
  children: React.ReactNode;
  classProps: string;
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
