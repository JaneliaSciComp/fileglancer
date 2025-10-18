import React from 'react';
import { Typography } from '@material-tailwind/react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  materialDark,
  coy
} from 'react-syntax-highlighter/dist/esm/styles/prism';

import Crumbs from './Crumbs';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useCookiesContext } from '@/contexts/CookiesContext';
import {
  formatFileSize,
  formatUnixTimestamp,
  fetchFileWithTextDetection
} from '@/utils';
import type { FileOrFolder } from '@/shared.types';
import logger from '@/logger';

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
  const { cookies } = useCookiesContext();

  const [content, setContent] = React.useState<string>('');
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = React.useState<boolean>(false);

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

  React.useEffect(() => {
    const fetchFileContent = async () => {
      if (!fileBrowserState.currentFileSharePath) {
        setError('No file share path selected');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { content: fileContent } = await fetchFileWithTextDetection(
          fileBrowserState.currentFileSharePath.name,
          file.path,
          cookies
        );
        setContent(fileContent);
      } catch (err) {
        logger.error('Error fetching file content:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch file content'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchFileContent();
  }, [
    file.path,
    fileBrowserState.currentFileSharePath,
    fileBrowserState.fileContentRefreshTrigger,
    cookies
  ]);

  const renderViewer = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Typography className="text-foreground">
            Loading file content...
          </Typography>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-64">
          <Typography className="text-error">Error: {error}</Typography>
        </div>
      );
    }

    const language = getLanguageFromExtension(file.name);

    return (
      <div className="h-full overflow-y-auto">
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
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full max-h-full overflow-hidden">
      {/* Header with breadcrumbs */}
      <div className="px-2 py-2 border-b border-surface">
        <Crumbs />
      </div>

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
      <div className="flex-1 overflow-hidden bg-background">
        {renderViewer()}
      </div>
    </div>
  );
}
