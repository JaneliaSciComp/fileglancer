import InstructionBlock from '@/components/ui/Dialogs/dataLinkUsage/InstructionBlock';
import PrerequisitesBlock from '@/components/ui/Dialogs/dataLinkUsage/PrerequisitesBlock';
import Steps from '@/components/ui/Dialogs/dataLinkUsage/tabsContent/javaTab/Steps';

import type {
  DataLinkType,
  ZarrVersion
} from '@/components/ui/Dialogs/dataLinkUsage/DataLinkUsageDialog';

type JavaTabProps = {
  readonly dataType: DataLinkType;
  readonly dataLinkUrl: string;
  readonly tooltipTriggerClasses: string;
  readonly zarrVersion?: ZarrVersion;
};

// Determines whether to include the C-Blosc native library as a prerequisite, which is needed for blosc-compressed data when using n5-universe
const usesN5Universe = (dataType: DataLinkType, zarrVersion?: ZarrVersion) =>
  dataType === 'n5' ||
  ((dataType === 'zarr' || dataType === 'ome-zarr') && zarrVersion !== 3);

export default function JavaTab({
  dataType,
  dataLinkUrl,
  tooltipTriggerClasses,
  zarrVersion
}: JavaTabProps) {
  const prerequisites = [
    {
      label: 'Java Development Kit (JDK)',
      href: 'https://www.azul.com/downloads/?version=java-21-lts&package=jdk-fx#zulu'
    },
    {
      label: 'Set Java environmental variables',
      href: 'https://www.geeksforgeeks.org/java/setting-environment-java/'
    },
    {
      label: 'Gradle',
      href: 'https://docs.gradle.org/current/userguide/installation.html'
    },
    ...(usesN5Universe(dataType, zarrVersion)
      ? [
          {
            label: 'C-Blosc native library (for blosc-compressed data)',
            href: 'https://www.blosc.org/'
          }
        ]
      : [])
  ];

  return (
    <>
      <PrerequisitesBlock prerequisites={prerequisites} />
      <InstructionBlock
        steps={Steps({
          dataType,
          dataLinkUrl,
          tooltipTriggerClasses,
          zarrVersion
        })}
      />
    </>
  );
}
