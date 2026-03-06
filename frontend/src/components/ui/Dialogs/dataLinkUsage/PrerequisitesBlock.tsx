import { Typography } from '@material-tailwind/react';

import ExternalLink from '@/components/ui/Dialogs/dataLinkUsage/ExternalLink';

interface Prerequisite {
  readonly label: string;
  readonly href: string;
}

interface PrerequisitesBlockProps {
  readonly prerequisites: Prerequisite[];
}

export default function PrerequisitesBlock({
  prerequisites
}: PrerequisitesBlockProps) {
  if (prerequisites.length === 0) {
    return null;
  }

  return (
    <div className="text-foreground">
      <Typography className="font-semibold text-lg">Prerequisites:</Typography>
      <ul className="mt-1 list-disc pl-5 space-y-1">
        {prerequisites.map(({ label, href }) => (
          <li className="text-base" key={label}>
            <ExternalLink href={href}>{label}</ExternalLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
