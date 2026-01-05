import { useEffect, useState } from 'react';
import { Switch, Typography } from '@material-tailwind/react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  materialDark,
  coy
} from 'react-syntax-highlighter/dist/esm/styles/prism';

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

export default function FileViewer({ file }: FileViewerProps) {
  const { fspName } = useFileBrowserContext();

  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [formatJson, setFormatJson] = useState<boolean>(true);

  const contentQuery = useFileContentQuery(fspName, file.path);
  const language = getLanguageFromExtension(file.name);
  const isJsonFile = language === 'json';

  // Detect dark mode from document
  useEffect(() => {
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

    const content = contentQuery.data ?? '';

    // Format JSON if toggle is enabled and content is valid JSON
    let displayContent = content;
    if (isJsonFile && formatJson && content) {
      try {
        const parsed = JSON.parse(content);
        displayContent = JSON.stringify(parsed, null, 2);
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
        paddingBottom: '2em'
      }
    };

    return (
      <SyntaxHighlighter
        codeTagProps={mergedCodeTagProps}
        customStyle={{
          margin: 0,
          padding: '1rem',
          fontSize: '14px',
          lineHeight: '1.5',
          overflow: 'visible',
          width: '100%',
          boxSizing: 'border-box',
          minHeight: 'fit-content'
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
        {isJsonFile ? (
          <div className="flex items-center gap-2 shrink-0">
            <Typography className="text-foreground text-sm whitespace-nowrap">
              Format JSON
            </Typography>
            <Switch
              checked={formatJson}
              onChange={() => setFormatJson(!formatJson)}
            />
          </div>
        ) : null}
      </div>

      {/* File content viewer */}
      <div className="flex-1 overflow-auto bg-background min-h-0">
        {renderViewer()}
      </div>
    </div>
  );
}
