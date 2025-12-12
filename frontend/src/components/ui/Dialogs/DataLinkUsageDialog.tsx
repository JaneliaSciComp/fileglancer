import { useState } from 'react';
import { Typography, Tabs } from '@material-tailwind/react';
import { HiOutlineClipboardCopy } from 'react-icons/hi';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  materialDark,
  coy
} from 'react-syntax-highlighter/dist/esm/styles/prism';

import FgDialog from './FgDialog';
import FgTooltip from '../widgets/FgTooltip';
import useCopyTooltip from '@/hooks/useCopyTooltip';
import useDarkMode from '@/hooks/useDarkMode';

function CopyIconAndTooltip({
  copyLabel,
  copyText
}: {
  readonly copyLabel: string;
  readonly copyText: string;
}) {
  const { showCopiedTooltip, handleCopy } = useCopyTooltip();

  return (
    <FgTooltip
      icon={HiOutlineClipboardCopy}
      label={copyLabel}
      onClick={async () => await handleCopy(copyText)}
      triggerClasses="text-foreground/50 hover:text-foreground"
      variant="ghost"
    >
      {showCopiedTooltip ? (
        <div className="absolute top-full right-0 mt-1 bg-surface-dark text-foreground text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
          {copyLabel === 'Copy data link'
            ? 'Data link copied!'
            : copyLabel === 'Copy code'
              ? 'Code copied!'
              : 'Copied!'}
        </div>
      ) : null}
    </FgTooltip>
  );
}

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
    paddingTop: '1em',
    paddingRight: '1em',
    paddingBottom: '0',
    paddingLeft: '1em',
    fontSize: '14px',
    lineHeight: '1.5'
  }
}: CodeBlockProps) {
  const isDarkMode = useDarkMode();
  const { showCopiedTooltip, handleCopy } = useCopyTooltip();

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
    <>
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
          <FgTooltip
            icon={HiOutlineClipboardCopy}
            label={copyLabel}
            onClick={async () => await handleCopy(code)}
            triggerClasses="text-foreground/50 hover:text-foreground"
            variant="ghost"
          >
            {showCopiedTooltip ? (
              <div className="absolute top-full right-0 mt-1 bg-surface-dark text-foreground text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
                {copyLabel === 'Copy data link'
                  ? 'Data link copied!'
                  : copyLabel === 'Copy code'
                    ? 'Code copied!'
                    : 'Copied!'}
              </div>
            ) : null}
          </FgTooltip>
        </div>
      ) : null}
    </>
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

  return (
    <FgDialog onClose={onClose} open={open}>
      <div className="flex flex-col gap-4 my-4">
        <div className="flex items-center gap-4">
          <Typography className="text-foreground font-semibold text-lg">
            How to use your data link
          </Typography>
          <CopyIconAndTooltip
            copyLabel="Copy data link"
            copyText={dataLinkUrl}
          />
        </div>
        <Tabs
          className="flex flex-col flex-1 min-h-0 gap-0"
          key="data-link-usage-tabs"
          onValueChange={setActiveTab}
          value={activeTab}
        >
          <Tabs.List className="justify-start items-stretch shrink-0 min-w-fit w-full rounded-b-none bg-surface dark:bg-surface-light">
            <Tabs.Trigger className="!text-foreground h-full" value="napari">
              Napari
            </Tabs.Trigger>

            <Tabs.Trigger className="!text-foreground h-full" value="python">
              Python
            </Tabs.Trigger>

            <Tabs.Trigger className="!text-foreground h-full" value="java">
              Java
            </Tabs.Trigger>
            <Tabs.TriggerIndicator className="h-full" />
          </Tabs.List>

          {/* Napari panel */}
          <Tabs.Panel
            className="flex-1 flex flex-col gap-4 max-w-full p-4 rounded-b-lg border border-t-0 border-surface"
            value="napari"
          >
            <InstructionBlock
              steps={[
                'Install napari-ome-zarr plugin',
                'Launch napari',
                'Open the data URL'
              ]}
            />
          </Tabs.Panel>

          {/* Python panel */}
          <Tabs.Panel
            className="flex-1 flex flex-col gap-4 max-w-full p-4 rounded-b-lg border border-t-0 border-surface"
            value="python"
          >
            <InstructionBlock steps={['Install zarr package']} />
            <CodeBlock
              code={`import zarr
store = zarr.open("${dataLinkUrl}")`}
              copyLabel="Copy code"
              copyable={true}
              language="python"
            />
          </Tabs.Panel>

          {/* Java panel */}
          <Tabs.Panel
            className="flex-1 flex flex-col gap-4 max-w-full p-4 rounded-b-lg border border-t-0 border-surface"
            value="java"
          >
            <CodeBlock
              code={`String url = "${dataLinkUrl}";`}
              copyLabel="Copy code"
              copyable={true}
              language="java"
            />
          </Tabs.Panel>
        </Tabs>
      </div>
    </FgDialog>
  );
}
