import { useState } from 'react';
import { Switch, Typography } from '@material-tailwind/react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  materialDark,
  coy
} from 'react-syntax-highlighter/dist/esm/styles/prism';
import { HiOutlineDownload } from 'react-icons/hi';
import { Formatter } from 'fracturedjsonjs';

import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { formatFileSize, formatUnixTimestamp, getFileURL } from '@/utils';
import type { FileOrFolder } from '@/shared.types';
import {
  useFileContentQuery,
  useFileMetadataQuery,
  useFileBinaryPreviewQuery
} from '@/queries/fileContentQueries';
import HexDump from './HexDump';
import useDarkMode from '@/hooks/useDarkMode';

type FileViewerProps = {
  readonly file: FileOrFolder;
};

// Map file extensions to syntax highlighter languages
const getLanguageFromExtension = (filename: string): string => {
  const extension = filename.split('.').pop()?.toLowerCase() || '';

  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    json: 'json',
    zattrs: 'json',
    zarray: 'json',
    zgroup: 'json',
    yml: 'yaml',
    yaml: 'yaml',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    md: 'markdown',
    sh: 'bash',
    bash: 'bash',
    zsh: 'zsh',
    fish: 'fish',
    ps1: 'powershell',
    sql: 'sql',
    java: 'java',
    jl: 'julia',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    r: 'r',
    matlab: 'matlab',
    m: 'matlab',
    tex: 'latex',
    dockerfile: 'docker',
    makefile: 'makefile',
    gitignore: 'gitignore',
    toml: 'toml',
    ini: 'ini',
    cfg: 'ini',
    conf: 'ini',
    properties: 'properties'
  };

  return languageMap[extension] || 'text';
};

export default function FileViewer({ file }: FileViewerProps) {
  const { fspName } = useFileBrowserContext();
  const isDarkMode = useDarkMode();
  const [formatJson, setFormatJson] = useState<boolean>(true);

  const metadataQuery = useFileMetadataQuery(fspName, file.path);

  const isBinary = metadataQuery.data?.isBinary === true;

  const binaryPreviewQuery = useFileBinaryPreviewQuery(
    fspName,
    file.path,
    isBinary
  );

  const shouldFetchContent = metadataQuery.isSuccess && !isBinary;
  const contentQuery = useFileContentQuery(
    shouldFetchContent ? fspName : undefined,
    file.path
  );

  const language = getLanguageFromExtension(file.name);
  const isJsonFile = language === 'json';

  const renderViewer = () => {
    // Binary file: show hex preview as soon as the first bytes arrive
    if (isBinary) {
      if (binaryPreviewQuery.isPending) {
        return (
          <Typography className="p-4 text-foreground">
            Loading binary preview...
          </Typography>
        );
      }
      if (binaryPreviewQuery.error) {
        return (
          <Typography className="p-4 text-foreground/60">
            Binary file — preview unavailable
          </Typography>
        );
      }
      return (
        <HexDump
          bytes={binaryPreviewQuery.data!}
          totalFileSize={file.size ?? undefined}
        />
      );
    }

    if (metadataQuery.isLoading) {
      return (
        <Typography className="p-4 text-foreground">
          Loading file content...
        </Typography>
      );
    }

    if (metadataQuery.error) {
      return (
        <Typography className="p-4 text-error">
          Error: {metadataQuery.error.message}
        </Typography>
      );
    }

    if (contentQuery.isLoading) {
      return (
        <Typography className="p-4 text-foreground">
          Loading file content...
        </Typography>
      );
    }

    if (contentQuery.error) {
      return (
        <Typography className="p-4 text-error">
          Error: {contentQuery.error.message}
        </Typography>
      );
    }

    const content = contentQuery.data ?? '';

    // Format JSON if toggle is enabled and content is valid JSON
    let displayContent = content;
    if (isJsonFile && formatJson && content) {
      try {
        const parsed = JSON.parse(content);
        const formatter = new Formatter();
        formatter.Options.IndentSpaces = 2;
        displayContent = formatter.Serialize(parsed);
      } catch {
        // If JSON parsing fails, show original content
        displayContent = content;
      }
    }

    // Get the theme's code styles and merge with padding bottom for scrollbar
    const theme = isDarkMode ? materialDark : coy;
    const themeCodeStyles = theme['code[class*="language-"]'] || {};
    const mergedCodeTagProps = {
      style: {
        ...themeCodeStyles,
        paddingBottom: '2em',
        background: 'transparent'
      }
    };

    return (
      <SyntaxHighlighter
        codeTagProps={mergedCodeTagProps}
        customStyle={{
          margin: 0,
          paddingTop: '1em',
          paddingRight: '1em',
          paddingBottom: '0',
          paddingLeft: '1em',
          fontSize: '14px',
          lineHeight: '1.5',
          overflow: 'visible',
          width: '100%',
          boxSizing: 'border-box',
          minHeight: 'fit-content',
          background: 'transparent'
        }}
        language={language}
        showLineNumbers={false}
        style={isDarkMode ? materialDark : coy}
        wrapLines={true}
        wrapLongLines={true}
      >
        {displayContent}
      </SyntaxHighlighter>
    );
  };

  // Determine if we should show JSON format toggle
  const showJsonToggle = isJsonFile && !isBinary;

  const downloadUrl = fspName ? getFileURL(fspName, file.path) : null;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* File info header */}
      <div className="px-4 py-2 bg-surface-light border-b border-surface flex items-center justify-between shrink-0">
        <div className="min-w-0 flex-1 mr-4">
          <Typography className="text-foreground truncate" type="h6">
            {file.name}
          </Typography>
          <Typography className="text-foreground">
            {formatFileSize(file.size)} • Last modified:{' '}
            {formatUnixTimestamp(file.last_modified)}
          </Typography>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {showJsonToggle ? (
            <div className="flex items-center gap-2">
              <Typography className="text-foreground text-sm whitespace-nowrap">
                Format JSON
              </Typography>
              <Switch
                checked={formatJson}
                onChange={() => setFormatJson(!formatJson)}
              />
            </div>
          ) : null}
          {downloadUrl ? (
            <a download={file.name} href={downloadUrl} title="Download file">
              <HiOutlineDownload className="text-foreground hover:text-primary text-xl" />
            </a>
          ) : null}
        </div>
      </div>

      {/* File content viewer */}
      <div className="flex-1 overflow-auto bg-background min-h-0">
        {renderViewer()}
      </div>
    </div>
  );
}
