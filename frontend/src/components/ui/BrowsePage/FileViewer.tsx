import React from 'react';
import { Typography } from '@material-tailwind/react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  materialDark,
  coy
} from 'react-syntax-highlighter/dist/esm/styles/prism';

import Crumbs from './Crumbs';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { formatFileSize, formatUnixTimestamp } from '@/utils';
import type { FileOrFolder } from '@/shared.types';
import { useFileContentQuery } from '@/queries/fileContentQueries';

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

export default function FileViewer({ file }: FileViewerProps): React.ReactNode {
  const { fileBrowserState } = useFileBrowserContext();

  const [isDarkMode, setIsDarkMode] = React.useState<boolean>(false);

  const contentQuery = useFileContentQuery(
    fileBrowserState.uiFileSharePath?.name,
    file.path
  );

  // Detect dark mode from document
  React.useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };

    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  const renderViewer = () => {
    if (contentQuery.isLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Typography className="text-foreground">
            Loading file content...
          </Typography>
        </div>
      );
    }

    if (contentQuery.error) {
      return (
        <div className="flex items-center justify-center h-64">
          <Typography className="text-error">
            Error: {contentQuery.error.message}
          </Typography>
        </div>
      );
    }

    const language = getLanguageFromExtension(file.name);
    const content = contentQuery.data ?? '';

    return (
      <SyntaxHighlighter
        customStyle={{
          margin: 0,
          padding: '1rem',
          fontSize: '14px',
          lineHeight: '1.5'
        }}
        language={language}
        showLineNumbers={false}
        style={isDarkMode ? materialDark : coy}
        wrapLines={true}
        wrapLongLines={true}
      >
        {content}
      </SyntaxHighlighter>
    );
  };

  return (
    <div className="flex flex-col h-full max-h-full overflow-hidden">
      {/* File info header */}
      <div className="px-4 py-2 bg-surface-light border-b border-surface">
        <Typography className="text-foreground" type="h6">
          {file.name}
        </Typography>
        <Typography className="text-foreground">
          {formatFileSize(file.size)} • Last modified:{' '}
          {formatUnixTimestamp(file.last_modified)}
        </Typography>
      </div>

      {/* File content viewer */}
      <div className="flex-1 overflow-y-auto bg-background">
        {renderViewer()}
      </div>
    </div>
  );
}
