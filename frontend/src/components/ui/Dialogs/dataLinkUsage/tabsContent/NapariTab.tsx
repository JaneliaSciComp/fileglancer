import { Fragment } from 'react/jsx-runtime';

import CodeBlock from '@/components/ui/Dialogs/dataLinkUsage/CodeBlock';
import InstructionBlock from '@/components/ui/Dialogs/dataLinkUsage/InstructionBlock';
import ExternalLink from '@/components/ui/Dialogs/dataLinkUsage/ExternalLink';
import PrerequisitesBlock from '@/components/ui/Dialogs/dataLinkUsage/PrerequisitesBlock';

type NapariTabProps = {
  readonly dataLinkUrl: string;
  readonly tooltipTriggerClasses: string;
};

export default function NapariTab({
  dataLinkUrl,
  tooltipTriggerClasses
}: NapariTabProps) {
  return (
    <>
      <PrerequisitesBlock
        prerequisites={[
          {
            label: 'Pixi',
            href: 'https://pixi.prefix.dev/latest/installation/'
          }
        ]}
      />
      <InstructionBlock
        steps={[
          <Fragment key="one-line-command">
            <span>
              Run the below command to use pixi to install the required
              dependencies and launch napari.
            </span>
            <span>
              Note: the napari-ome-zarr plugin requires the data link to contain
              the <code>.zarr</code> extension. If your data link does not
              include this extension, make a data link for the level of the Zarr
              directory that does include <code>.zarr</code>, and then add the
              extra path segments to reach the desired directory for
              viewing/analysis.
            </span>
            <CodeBlock
              code={`pixi exec --spec python=3.12 --spec napari --spec pyqt --spec napari-ome-zarr -- napari ${dataLinkUrl}`}
              copyLabel="Copy code"
              copyable={true}
              language="bash"
              tooltipTriggerClasses={tooltipTriggerClasses}
            />
            <ExternalLink href="https://napari.org/stable/tutorials/fundamentals/installation.html">
              Napari documentation
            </ExternalLink>
          </Fragment>,
          'In the pop-up, select the napari-ome-zarr plugin to open the image. Optionally, save this as the default choice for all files ending with .zarr.'
        ]}
      />
    </>
  );
}
