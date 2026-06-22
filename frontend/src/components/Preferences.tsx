import { Card, Typography } from '@material-tailwind/react';

import DataLinkOptions from '@/components/ui/PreferencesPage/DataLinkOptions';
import DisplayOptions from '@/components/ui/PreferencesPage/DisplayOptions';
import JobOptions from '@/components/ui/PreferencesPage/JobOptions';
import NeuroglancerOptions from '@/components/ui/PreferencesPage/NeuroglancerOptions';
import PathFormatOptions from '@/components/ui/PreferencesPage/PathFormatOptions';

export default function Preferences() {
  return (
    <>
      <Typography className="text-foreground pb-6" type="h5">
        Preferences
      </Typography>

      <Card className="min-h-max shrink-0 dark:border-surface-light">
        <Card.Body className="flex flex-col gap-8 p-6">
          <div>
            <Typography className="font-semibold mb-4" type="lead">
              File browser display
            </Typography>
            <div className="flex flex-col gap-4 pl-4 max-w-md">
              <PathFormatOptions />
              <DisplayOptions />
            </div>
          </div>

          <div>
            <Typography className="font-semibold mb-4" type="lead">
              Data links
            </Typography>
            <div className="flex flex-col gap-4 pl-4 max-w-md">
              <DataLinkOptions />
              <NeuroglancerOptions />
            </div>
          </div>

          <div>
            <Typography className="font-semibold mb-4" type="lead">
              Jobs
            </Typography>
            <div className="pl-4 max-w-md">
              <JobOptions />
            </div>
          </div>
        </Card.Body>
      </Card>
    </>
  );
}
