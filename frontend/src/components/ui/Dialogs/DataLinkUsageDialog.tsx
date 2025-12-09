import { Typography } from '@material-tailwind/react';
import { HiOutlineClipboardCopy } from 'react-icons/hi';

import FgDialog from './FgDialog';
import FgTooltip from '../widgets/FgTooltip';
import useCopyTooltip from '@/hooks/useCopyTooltip';
import { copy } from '@testing-library/user-event/dist/cjs/clipboard/copy.js';

type CodeSnippetItem = {
  type: 'code';
  label: string;
  code: string;
  copyText: string;
  copyLabel?: string;
};

type InstructionItem = {
  type: 'instructions';
  label: string;
  steps: string[];
  copyText: string;
  copyLabel?: string;
};

type DialogItem = CodeSnippetItem | InstructionItem;

type CodeSnippetBlockProps = {
  readonly label: string;
  readonly code: string;
  readonly copyText: string;
  readonly copyLabel?: string;
};

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

function CodeSnippetBlock({
  label,
  code,
  copyText,
  copyLabel = 'Copy'
}: CodeSnippetBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      <Typography className="text-foreground font-semibold">{label}</Typography>
      <div className="relative bg-surface rounded-md p-4">
        <pre className="text-foreground text-sm font-mono break-normal whitespace-pre-wrap pr-10">
          {code}
        </pre>
        <div className="absolute top-2 right-2">
          <CopyIconAndTooltip copyLabel={copyLabel} copyText={copyText} />
        </div>
      </div>
    </div>
  );
}

type InstructionBlockProps = {
  readonly label: string;
  readonly steps: string[];
  readonly copyText: string;
  readonly copyLabel?: string;
};

function InstructionBlock({
  label,
  steps,
  copyText,
  copyLabel = 'Copy'
}: InstructionBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Typography className="text-foreground font-semibold">
          {label}
        </Typography>
        <CopyIconAndTooltip copyLabel={copyLabel} copyText={copyText} />
      </div>
      <div className="rounded-lg border border-surface p-4">
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
      </div>
    </div>
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
  const items: DialogItem[] = [
    {
      type: 'instructions',
      label: 'Napari',
      steps: [
        'Install napari-ome-zarr plugin',
        'Launch napari',
        'Open the data URL'
      ],
      copyText: dataLinkUrl,
      copyLabel: 'Copy data link'
    },
    {
      type: 'code',
      label: 'Python',
      code: `import zarr
store = zarr.open("${dataLinkUrl}")`,
      copyText: `import zarr
store = zarr.open("${dataLinkUrl}")`,
      copyLabel: 'Copy code'
    },
    {
      type: 'code',
      label: 'Java',
      code: `String url = "${dataLinkUrl}";`,
      copyText: `String url = "${dataLinkUrl}";`,
      copyLabel: 'Copy code'
    }
  ];

  return (
    <FgDialog onClose={onClose} open={open}>
      <div className="flex flex-col gap-6 my-4">
        <Typography className="text-foreground font-semibold text-lg">
          How to use your data link
        </Typography>
        {items.map(item => {
          if (item.type === 'code') {
            return (
              <CodeSnippetBlock
                code={item.code}
                copyLabel={item.copyLabel}
                copyText={item.copyText}
                key={item.label}
                label={item.label}
              />
            );
          }
          return (
            <InstructionBlock
              copyLabel={item.copyLabel}
              copyText={item.copyText}
              key={item.label}
              label={item.label}
              steps={item.steps}
            />
          );
        })}
      </div>
    </FgDialog>
  );
}
