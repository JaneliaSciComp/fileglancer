import logger from '@/logger';
import { Link } from 'react-router';
import { Typography } from '@material-tailwind/react';

import errorImg from '@/assets/error_icon_gradient.png';

export default function ErrorFallback({ error }: any) {
  if (error instanceof Error) {
    logger.error('ErrorBoundary caught an error:', error);
  }
  return (
    <div className="flex-grow overflow-y-auto w-full">
      <div className="flex flex-col gap-4 justify-center items-center pt-8">
        {error instanceof Error ? (
          <>
            <Typography
              type="h2"
              className="text-black dark:text-white font-bold"
            >
              Oops! An error occurred
            </Typography>
            <Typography
              type="h5"
              className="text-foreground"
            >{`${error.message ? error.message : 'Unknown error'}`}</Typography>
          </>
        ) : (
          <Typography
            type="h2"
            className="text-black dark:text-white font-bold"
          >
            Oops! An unknown error occurred
          </Typography>
        )}
        <Typography
          type="h5"
          as={Link}
          to="https://forms.clickup.com/10502797/f/a0gmd-713/NBUCBCIN78SI2BE71G"
          target="_blank"
          rel="noopener noreferrer"
          className="text-black dark:text-white underline"
        >
          Submit a bug report
        </Typography>

        <Typography
          type="h5"
          as={Link}
          to="/browse"
          target="_blank"
          rel="noopener noreferrer"
          className="text-black dark:text-white underline"
        >
          Go back home
        </Typography>

        <img
          src={errorImg}
          alt="An icon showing a magnifying glass with a question mark hovering over an eye on a page"
          className="dark:bg-slate-50/80 rounded-full ml-4 mt-4 h-[500px] w-[500px]"
        />
      </div>
    </div>
  );
}
