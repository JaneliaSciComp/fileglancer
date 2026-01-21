import { useState } from 'react';
import { Typography, Tabs } from '@material-tailwind/react';
import { HiOutlineClipboardCopy } from 'react-icons/hi';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  materialDark,
  coy
} from 'react-syntax-highlighter/dist/esm/styles/prism';

import FgDialog from './FgDialog';
import useDarkMode from '@/hooks/useDarkMode';
import CopyTooltip from '@/components/ui/widgets/CopyTooltip';

type CodeBlockProps = {
  readonly code: string;
  readonly language?: string;
  readonly showLineNumbers?: boolean;
  readonly wrapLines?: boolean;
  readonly wrapLongLines?: boolean;
  readonly copyable?: boolean;
  readonly copyLabel?: string;
  readonly customStyle?: React.CSSProperties;
};

const TOOLTIP_TRIGGER_CLASSES =
  'text-foreground/50 hover:text-foreground py-1 px-2';

function CodeBlock({
  code,
  language = 'text',
  showLineNumbers = false,
  wrapLines = true,
  wrapLongLines = true,
  copyable = false,
  copyLabel = 'Copy code',
  customStyle = {
    margin: 0,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    paddingTop: '3em',
    paddingRight: '1em',
    paddingBottom: '0',
    paddingLeft: '1em',
    fontSize: '14px',
    lineHeight: '1.5'
  }
}: CodeBlockProps) {
  const isDarkMode = useDarkMode();

  // Get the theme's code styles and merge with custom codeTagProps
  const theme = isDarkMode ? materialDark : coy;
  const themeCodeStyles = theme['code[class*="language-"]'] || {};
  const mergedCodeTagProps = {
    style: {
      ...themeCodeStyles,
      paddingBottom: '1em'
    }
  };

  return (
    <div className="relative">
      <SyntaxHighlighter
        codeTagProps={mergedCodeTagProps}
        customStyle={customStyle}
        language={language}
        showLineNumbers={showLineNumbers}
        style={isDarkMode ? materialDark : coy}
        wrapLines={wrapLines}
        wrapLongLines={wrapLongLines}
      >
        {code}
      </SyntaxHighlighter>
      {copyable ? (
        <div className="absolute top-2 right-2">
          <CopyTooltip
            primaryLabel={copyLabel}
            textToCopy={code}
            tooltipTriggerClasses={TOOLTIP_TRIGGER_CLASSES}
          >
            <HiOutlineClipboardCopy className="icon-default" />
          </CopyTooltip>
        </div>
      ) : null}
    </div>
  );
}

type InstructionBlockProps = {
  readonly steps: string[];
};

function InstructionBlock({ steps }: InstructionBlockProps) {
  return (
    <ol className="space-y-3 text-foreground">
      {steps.map((step, index) => (
        <li className="flex items-start gap-3 text-sm" key={index}>
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold">
            {index + 1}
          </span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

type DataLinkUsageDialogProps = {
  readonly dataLinkUrl: string;
  readonly open: boolean;
  readonly onClose: () => void;
};

export default function DataLinkUsageDialog({
  dataLinkUrl,
  open,
  onClose
}: DataLinkUsageDialogProps) {
  const [activeTab, setActiveTab] = useState<string>('napari');

  const tabs = [
    {
      id: 'napari',
      label: 'Napari',
      content: (
        <InstructionBlock
          steps={[
            'Install napari-ome-zarr plugin',
            'Launch napari',
            'Open the data URL'
          ]}
        />
      )
    },
    {
      id: 'python',
      label: 'Python',
      content: (
        <>
          <InstructionBlock steps={['Install zarr package']} />
          <CodeBlock
            code={`import zarr
from zarr.storage import FsspecStore
from ome_zarr_models.v04.image import Image

url = ${dataLinkUrl}

# Open the zarr store using fsspec for HTTP access
store = FsspecStore.from_url(url)
root = zarr.open_group(store, mode='r')

# Read OME-ZARR metadata using ome-zarr-models
ome_image = Image.from_zarr(root)
ome_image_metadata = ome_image.attributes
multiscales = ome_image_metadata.multiscales
print(f'Version: {multiscales[0].version}')
print(f'Name: {multiscales[0].name}')
print(f'Axes: {[(ax.name, ax.type, ax.unit) for ax in multiscales[0].axes]}')
print(f'Datasets: {[ds.path for ds in multiscales[0].datasets]}')

# Print coordinate transforms for each scale level
for ds in multiscales[0].datasets:
    if ds.coordinateTransformations:
        for ct in ds.coordinateTransformations:
            if hasattr(ct, 'scale'):
                print(f'{ds.path} scale: {ct.scale}')
            if hasattr(ct, 'translation'):
                print(f'{ds.path} translation: {ct.translation}')

# Access the highest resolution array
if '0' in root:
    arr = root['0']
    print(f'\\nHighest resolution array shape: {arr.shape}')
    print(f'Array dtype: {arr.dtype}')
    print(f'Array chunks: {arr.chunks}')

# Read a small slice of data
if '0' in root:
    data = arr[0,0,500:600,1000:1100,1000:1100]
    print(f'\\nLoaded slice shape: {data.shape}')
    print(f'Data min: {data.min()}, max: {data.max()}')`}
            copyLabel="Copy code"
            copyable={true}
            language="python"
          />
        </>
      )
    },
    {
      id: 'java',
      label: 'Java',
      content: (
        <CodeBlock
          code={`String url = "${dataLinkUrl}";`}
          copyLabel="Copy code"
          copyable={true}
          language="java"
        />
      )
    }
  ];

  const TAB_TRIGGER_CLASSES = '!text-foreground h-full';
  const PANEL_CLASSES =
    'flex-1 flex flex-col gap-4 max-w-full p-4 rounded-b-lg border border-t-0 border-surface bg-surface-light';

  return (
    <FgDialog onClose={onClose} open={open}>
      <div className="flex flex-col gap-4 my-4">
        <div className="flex items-center gap-4">
          <Typography className="text-foreground font-semibold text-lg">
            How to use your data link
          </Typography>
          <CopyTooltip
            primaryLabel="Copy data link"
            textToCopy={dataLinkUrl}
            tooltipTriggerClasses={TOOLTIP_TRIGGER_CLASSES}
          >
            <HiOutlineClipboardCopy className="icon-default" />
          </CopyTooltip>
        </div>
        <Tabs
          className="flex flex-col flex-1 min-h-0 gap-0"
          key="data-link-usage-tabs"
          onValueChange={setActiveTab}
          value={activeTab}
        >
          <Tabs.List className="justify-start items-stretch shrink-0 min-w-fit w-full rounded-b-none bg-surface dark:bg-surface-light">
            {tabs.map(tab => (
              <Tabs.Trigger
                className={TAB_TRIGGER_CLASSES}
                key={tab.id}
                value={tab.id}
              >
                {tab.label}
              </Tabs.Trigger>
            ))}
            <Tabs.TriggerIndicator className="h-full" />
          </Tabs.List>

          {tabs.map(tab => (
            <Tabs.Panel className={PANEL_CLASSES} key={tab.id} value={tab.id}>
              {tab.content}
            </Tabs.Panel>
          ))}
        </Tabs>
      </div>
    </FgDialog>
  );
}
