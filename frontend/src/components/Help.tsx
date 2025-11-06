import { Card, Spinner, Typography } from '@material-tailwind/react';
import { Link } from 'react-router';
import { TbBrandGithub } from 'react-icons/tb';
import { SiClickup, SiSlack } from 'react-icons/si';
import { IconType } from 'react-icons/lib';
import { LuBookOpenText } from 'react-icons/lu';
import { HiExternalLink } from 'react-icons/hi';

import useVersionQuery from '@/queries/versionQuery';

type HelpLink = {
  icon: IconType;
  title: string;
  description: string;
  url: string;
};

function getHelpLinks(version: string | undefined): HelpLink[] {
  return [
    {
      icon: LuBookOpenText,
      title: 'User Manual',
      description:
        'Comprehensive guide to Fileglancer features and functionality',
      url: 'https://fileglancer-docs.janelia.org'
    },
    {
      icon: TbBrandGithub,
      title: 'Release Notes',
      description: version
        ? `What's new and improved in Fileglancer version ${version}`
        : "What's new and improved in Fileglancer",
      url: version
        ? `https://github.com/JaneliaSciComp/fileglancer/releases/tag/${version}`
        : 'https://github.com/JaneliaSciComp/fileglancer/releases'
    },
    {
      icon: SiClickup,
      title: 'Submit Tickets',
      description: 'Report bugs or request features through a ClickUp form',
      url: version
        ? `https://forms.clickup.com/10502797/f/a0gmd-713/NBUCBCIN78SI2BE71G?Version=${version}&URL=${window.location}`
        : `https://forms.clickup.com/10502797/f/a0gmd-713/NBUCBCIN78SI2BE71G?URL=${window.location}`
    },
    {
      icon: SiSlack,
      title: 'Community Support',
      description: 'Get help from the community on our dedicated Slack channel',
      url: 'https://hhmi.enterprise.slack.com/archives/C0938N06YN8'
    }
  ];
}

export default function Help() {
  const versionQuery = useVersionQuery();

  // Show loading state while query is pending
  if (versionQuery.isPending) {
    return (
      <Typography className="text-muted-foreground">
        Loading help resources...
      </Typography>
    );
  }

  const version = versionQuery.isError ? undefined : versionQuery.data.version;
  const versionDisplay = versionQuery.isError
    ? 'Error getting version number'
    : `Fileglancer Version ${version}`;
  const helpLinks = getHelpLinks(version);

  return (
    <>
      <div className="flex justify-between mb-6">
        <Typography className="text-foreground font-bold" type="h5">
          Help
        </Typography>
        <Typography className="text-foreground font-bold" type="lead">
          {versionDisplay}
        </Typography>
      </div>
      <div className="grid grid-cols-2 gap-10">
        {helpLinks.map(({ icon: Icon, title, description, url }) => (
          <Card
            as={Link}
            className="group min-h-44 p-8 md:p-12 flex flex-col gap-2 text-left w-full hover:shadow-lg transition-shadow duration-200"
            key={url}
            rel="noopener noreferrer"
            target="_blank"
            to={url}
          >
            <div className="flex items-center gap-2">
              <Icon className="hidden md:block icon-default lg:icon-large text-primary" />
              <div className="flex items-center gap-1 text-nowrap">
                <Typography className="text-base md:text-lg lg:text-xl text-primary font-semibold group-hover:underline">
                  {title}
                </Typography>
                <HiExternalLink className="icon-xsmall md:icon-small text-primary" />
              </div>
            </div>
            <Typography className="text-sm md:text-base text-muted-foreground">
              {description}
            </Typography>
          </Card>
        ))}
      </div>
    </>
  );
}
