import { Fragment } from 'react/jsx-runtime';

import CodeBlock from '@/components/ui/Dialogs/dataLinkUsage/CodeBlock';
import InstructionBlock from '@/components/ui/Dialogs/dataLinkUsage/InstructionBlock';
import PrerequisitesBlock from '@/components/ui/Dialogs/dataLinkUsage/PrerequisitesBlock';

type FileTabProps = {
  readonly dataLinkUrl: string;
  readonly tooltipTriggerClasses: string;
};

export function FileDownloadTab({
  dataLinkUrl,
  tooltipTriggerClasses
}: FileTabProps) {
  const curlCommand = `curl -O '${dataLinkUrl}'`;
  const wgetCommand = `wget '${dataLinkUrl}'`;

  return (
    <InstructionBlock
      steps={[
        <Fragment key="curl">
          <span>Download the file using curl:</span>
          <CodeBlock
            code={curlCommand}
            copyLabel="Copy curl command"
            copyable={true}
            language="bash"
            tooltipTriggerClasses={tooltipTriggerClasses}
          />
        </Fragment>,
        <Fragment key="wget">
          <span>Or download using wget:</span>
          <CodeBlock
            code={wgetCommand}
            copyLabel="Copy wget command"
            copyable={true}
            language="bash"
            tooltipTriggerClasses={tooltipTriggerClasses}
          />
        </Fragment>
      ]}
    />
  );
}

export function FilePythonTab({
  dataLinkUrl,
  tooltipTriggerClasses
}: FileTabProps) {
  const code = `pixi exec --spec requests -- python -c "
import requests

url = '${dataLinkUrl}'
filename = url.split('/')[-1] or 'downloaded_file'

response = requests.get(url, stream=True)
response.raise_for_status()

with open(filename, 'wb') as f:
    for chunk in response.iter_content(chunk_size=8192):
        f.write(chunk)

import os
size = os.path.getsize(filename)
print(f'Downloaded {filename} ({size} bytes)')
"`;

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
          <Fragment key="python-download">
            <span>
              Run this command to use pixi to install the required dependencies
              and download the file using Python:
            </span>
            <CodeBlock
              code={code}
              copyLabel="Copy code"
              copyable={true}
              language="bash"
              tooltipTriggerClasses={tooltipTriggerClasses}
            />
          </Fragment>
        ]}
      />
    </>
  );
}

export function FileBrowserTab({
  dataLinkUrl,
  tooltipTriggerClasses
}: FileTabProps) {
  return (
    <InstructionBlock
      steps={[
        'Paste this URL into your browser to download or view the file directly:',
        <CodeBlock
          code={dataLinkUrl}
          copyLabel="Copy URL"
          copyable={true}
          key="url"
          language="text"
          tooltipTriggerClasses={tooltipTriggerClasses}
        />
      ]}
    />
  );
}
