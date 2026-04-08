import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  materialDark,
  coy
} from 'react-syntax-highlighter/dist/esm/styles/prism';
import { HiOutlineClipboardCopy } from 'react-icons/hi';

import useDarkMode from '@/hooks/useDarkMode';
import CopyTooltip from '@/components/ui/widgets/CopyTooltip';

type CodeBlockProps = {
  readonly code: string;
  readonly copyable?: boolean;
  readonly copyLabel?: string;
  readonly customStyle?: React.CSSProperties;
  readonly language?: string;
  readonly showLineNumbers?: boolean;
  readonly tooltipTriggerClasses: string;
  readonly wrapLines?: boolean;
  readonly wrapLongLines?: boolean;
};

export default function CodeBlock({
  code,
  copyable = false,
  copyLabel = 'Copy code',
  customStyle,
  language = 'text',
  showLineNumbers = false,
  tooltipTriggerClasses,
  wrapLines = true,
  wrapLongLines = true
}: CodeBlockProps) {
  const isDarkMode = useDarkMode();

  // Note: margin and marginBottom need to be defined separately because the coy theme in react-syntax-highlighter defines both.
  // If we only set margin, the coy theme's marginBottom value will override ours and cause extra space at the bottom of the code block.
  const defaultStyle = {
    margin: '0 0',
    marginBottom: '0',
    padding: '3em 3em 1em 1em',
    fontSize: '14px',
    lineHeight: '1.5',
    width: '100%',
    boxSizing: 'border-box' as const,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    overflowX: 'hidden' as const,
    borderRadius: '0.5rem',
    background: 'transparent'
  };

  const mergedCustomStyle = customStyle
    ? { ...defaultStyle, ...customStyle }
    : defaultStyle;

  // Get the theme's code styles and merge with custom codeTagProps
  const theme = isDarkMode ? materialDark : coy;
  const themeCodeStyles = theme['code[class*="language-"]'] || {};
  const mergedCodeTagProps = {
    style: {
      ...themeCodeStyles,
      paddingBottom: '1.5em',
      whiteSpace: 'pre-wrap' as const,
      wordBreak: 'break-word' as const,
      background: 'transparent'
    }
  };

  return (
    <div className="relative w-full min-w-0 rounded-lg border border-surface dark:border-foreground/30 bg-surface-light dark:bg-surface">
      <SyntaxHighlighter
        codeTagProps={mergedCodeTagProps}
        customStyle={mergedCustomStyle}
        language={language}
        showLineNumbers={showLineNumbers}
        style={theme}
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
            tooltipTriggerClasses={tooltipTriggerClasses}
          >
            <HiOutlineClipboardCopy className="icon-default" />
          </CopyTooltip>
        </div>
      ) : null}
    </div>
  );
}
