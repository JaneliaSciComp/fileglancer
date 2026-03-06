import { Fragment } from 'react/jsx-runtime';
import CodeBlock from '@/components/ui/Dialogs/dataLinkUsage/CodeBlock';
import type {
  DataLinkType,
  ZarrVersion
} from '@/components/ui/Dialogs/dataLinkUsage/DataLinkUsageDialog';
import getBuildGradle from '@/components/ui/Dialogs/dataLinkUsage/tabsContent/javaTab/getBuildGradle';
import getCodeForDataType from '@/components/ui/Dialogs/dataLinkUsage/tabsContent/javaTab/getCodeForDataType';

function getJavaClassName(dataType: DataLinkType, zarrVersion?: ZarrVersion) {
  if (dataType === 'directory') {
    return 'ListFiles';
  }
  if (dataType === 'n5') {
    return 'ReadN5';
  }
  if (dataType === 'zarr') {
    return zarrVersion === 3 ? 'ReadZarrV3' : 'ReadZarrV2';
  }
  if (dataType === 'ome-zarr') {
    return zarrVersion === 3 ? 'ReadOmeZarrV05' : 'ReadOmeZarrV04';
  }
  return 'ReadOmeZarr';
}

type StepProps = {
  readonly dataType: DataLinkType;
  readonly dataLinkUrl: string;
  readonly tooltipTriggerClasses: string;
  readonly zarrVersion?: ZarrVersion;
};

export default function Steps({
  dataType,
  dataLinkUrl,
  tooltipTriggerClasses,
  zarrVersion
}: StepProps) {
  const javaClassName = getJavaClassName(dataType, zarrVersion);
  return [
    <Fragment key="structure">
      <span>
        Create the project structure and delete any existing example Java source
        files:
      </span>
      <CodeBlock
        code="mkdir -p my-project/src/main/java/org/janelia/fileglancer/example && rm -f my-project/src/main/java/org/janelia/fileglancer/example/*.java"
        copyLabel="Copy command"
        copyable={true}
        language="bash"
        tooltipTriggerClasses={tooltipTriggerClasses}
      />
    </Fragment>,
    <Fragment key="code-instructions">
      <span>Save the Java source file.</span>
      <span>
        Note: this sample code has the currently-selected data URL hardcoded. If
        you want to use a different URL, you will need to modify the source file
        accordingly.
      </span>
      <CodeBlock
        code={`cat << 'EOF' > my-project/src/main/java/org/janelia/fileglancer/example/${javaClassName}.java\n${getCodeForDataType(javaClassName, dataType, dataLinkUrl, zarrVersion)}\nEOF`}
        copyLabel="Copy command"
        copyable={true}
        language="bash"
        tooltipTriggerClasses={tooltipTriggerClasses}
      />
    </Fragment>,
    <Fragment key="settings">
      <span>Create my-project/settings.gradle:</span>
      <CodeBlock
        code={`echo "rootProject.name = 'java-example'" > my-project/settings.gradle`}
        copyLabel="Copy command"
        copyable={true}
        language="bash"
        tooltipTriggerClasses={tooltipTriggerClasses}
      />
    </Fragment>,
    <Fragment key="build">
      <span>Create my-project/build.gradle:</span>
      <CodeBlock
        code={`cat << 'EOF' > my-project/build.gradle\n${getBuildGradle(dataType, javaClassName, zarrVersion)}\nEOF`}
        copyLabel="Copy command"
        copyable={true}
        language="bash"
        tooltipTriggerClasses={tooltipTriggerClasses}
      />
    </Fragment>,
    <Fragment key="wrapper">
      <span>Initialize the Gradle wrapper:</span>
      <CodeBlock
        code="cd my-project && gradle wrapper"
        copyLabel="Copy command"
        copyable={true}
        language="bash"
        tooltipTriggerClasses={tooltipTriggerClasses}
      />
    </Fragment>,
    <Fragment key="run">
      <span>Run it:</span>
      <CodeBlock
        code="./gradlew run"
        copyLabel="Copy command"
        copyable={true}
        language="bash"
        tooltipTriggerClasses={tooltipTriggerClasses}
      />
    </Fragment>
  ];
}
