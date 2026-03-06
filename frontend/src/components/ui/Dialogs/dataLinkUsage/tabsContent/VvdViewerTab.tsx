import { Fragment } from 'react/jsx-runtime';

import PrerequisitesBlock from '@/components/ui/Dialogs/dataLinkUsage/PrerequisitesBlock';
import InstructionBlock from '@/components/ui/Dialogs/dataLinkUsage/InstructionBlock';
import ExternalLink from '@/components/ui/Dialogs/dataLinkUsage/ExternalLink';

export default function VvdViewerTab() {
  return (
    <>
      <PrerequisitesBlock
        prerequisites={[
          {
            label: 'VVDViewer',
            href: 'https://github.com/JaneliaSciComp/VVDViewer/releases'
          }
        ]}
      />
      <InstructionBlock
        steps={[
          <Fragment key="launch">
            <span>Launch VVDViewer.</span>
            <ExternalLink href="https://github.com/JaneliaSciComp/VVDViewer?tab=readme-ov-file#known-issues-for-mac">
              MacOS users - see the known issues on GitHub
            </ExternalLink>
          </Fragment>,
          'In the VVDViewer tool bar, select File \u2192 Open URL.',
          'Paste the data link in the dialog and click "Ok" to view the image.'
        ]}
      />
    </>
  );
}
