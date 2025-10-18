import logger from '@/logger';
import { Link } from 'react-router';
import { Typography } from '@material-tailwind/react';

import errorImg from '@/assets/error_icon_gradient.png';
import useVersionNo from '@/hooks/useVersionState';

export default function ErrorFallback({ error }: any) {
  if (error instanceof Error) {
    logger.error('ErrorBoundary caught an error:', error);
  }
  const { versionNo } = useVersionNo();
  return (
    <div className="flex-grow overflow-y-auto w-full">
      <div className="flex flex-col gap-4 justify-center items-center pt-8">
        {error instanceof Error ? (
          <>
            <Typography
              className="text-black dark:text-white font-bold"
              type="h2"
            >
              Oops! An error occurred
            </Typography>
            <Typography
              className="text-foreground"
              type="h5"
            >{`${error.message ? error.message : 'Unknown error'}`}</Typography>
          </>
        ) : (
          <Typography
            className="text-black dark:text-white font-bold"
            type="h2"
          >
            Oops! An unknown error occurred
          </Typography>
        )}
        <Typography
          as={Link}
          className="text-black dark:text-white underline"
          rel="noopener noreferrer"
          target="_blank"
          to={`https://forms.clickup.com/10502797/f/a0gmd-713/NBUCBCIN78SI2BE71G?Version=${versionNo}&URL=${window.location}`}
          type="h5"
        >
          Submit a bug report
        </Typography>

        <Typography
          as={Link}
          className="text-black dark:text-white underline"
          rel="noopener noreferrer"
          target="_blank"
          to="/browse"
          type="h5"
        >
          Go back home
        </Typography>

        <img
          alt="An icon showing a magnifying glass with a question mark hovering over an eye on a page"
          className="dark:bg-slate-50/80 rounded-full ml-4 mt-4 h-[500px] w-[500px]"
          src={errorImg}
        />
      </div>
    </div>
  );
}
