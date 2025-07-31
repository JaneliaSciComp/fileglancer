import { Link } from 'react-router-dom';
import { Typography } from '@material-tailwind/react';

import Tag from './Tag';

function BetaBanner() {
  return (
    <div className="flex justify-center items-center gap-1 w-full bg-yellow-200 dark:bg-yellow-200/80 pt-[5px] pb-1 text-yellow-800 font-semibold">
      <Typography className="text-sm">
        Find a bug or want to request a feature?
      </Typography>
      <Typography
        as={Link}
        className="underline text-sm"
        to="https://forms.clickup.com/10502797/f/a0gmd-713/NBUCBCIN78SI2BE71G"
        target="_blank"
        rel="noopener noreferrer"
      >
        Let us know.
      </Typography>
    </div>
  );
}

function BetaSticker() {
  return <Tag classProps="text-yellow-800 bg-yellow-200">BETA</Tag>;
}

export { BetaBanner, BetaSticker };
