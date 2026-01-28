import { useEffect, useState, useMemo } from 'react';
import { Switch, Typography, IconButton } from '@material-tailwind/react';
import {
  HiOutlineFolder,
  HiOutlineDocument,
  HiArrowLeft,
  HiOutlineDownload
} from 'react-icons/hi';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  materialDark,
  coy
} from 'react-syntax-highlighter/dist/esm/styles/prism';

import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { formatFileSize, formatUnixTimestamp } from '@/utils';
import type { FileOrFolder } from '@/shared.types';
import { useFileContentQuery } from '@/queries/fileContentQueries';
import {
  useOzxFileEntriesInfiniteQuery,
  useOzxFileContentQuery,
  buildOzxContentUrl
} from '@/queries/ozxQueries';
import type { OzxFileEntry } from '@/queries/ozxQueries';
import { isAnyZipFile, getOzxFilePath } from '@/utils/ozxDetection';

type FileViewerProps = {
  readonly file: FileOrFolder;
};

const InternalFileViewer = ({
  fspName,
  ozxPath,
  internalPath,
  onBack
}: {
  readonly fspName: string;
  readonly ozxPath: string;
  readonly internalPath: string;
  readonly onBack: () => void;
}) => {
  const { data, isLoading, error } = useOzxFileContentQuery(
    fspName,
    ozxPath,
    internalPath
  );
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  useEffect(() => {
    const checkDarkMode = () =>
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    return () => observer.disconnect();
  }, []);

  if (isLoading) {
    return <div className="p-4">Loading content...</div>;
  }
  if (error) {
    return <div className="p-4 text-error">Error: {error.message}</div>;
  }

  const content = data ? new TextDecoder().decode(data) : '';
  const language = getLanguageFromExtension(internalPath);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 bg-surface-light border-b border-surface">
        <IconButton
          className="text-foreground"
          onClick={onBack}
          size="sm"
          variant="ghost"
        >
          <HiArrowLeft className="h-4 w-4" />
        </IconButton>
        <Typography className="font-mono truncate" type="small">
          {internalPath}
        </Typography>
      </div>
      <div className="flex-1 overflow-auto">
        <SyntaxHighlighter
          customStyle={{ margin: 0, padding: '1rem' }}
          language={language}
          style={isDarkMode ? materialDark : coy}
          wrapLongLines={true}
        >
          {content}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

type ZipBrowserItem = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
};

const ZipBrowser = ({ file }: { readonly file: FileOrFolder }) => {
  const { fspName } = useFileBrowserContext();
  const ozxPath = getOzxFilePath(file);
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useOzxFileEntriesInfiniteQuery(fspName, ozxPath, 100);
  const [internalPath, setInternalPath] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Flatten all pages into a single array of entries
  const allEntries = useMemo<OzxFileEntry[]>(() => {
    if (!data?.pages) {
      return [];
    }
    return data.pages.flatMap(page => page.entries);
  }, [data]);

  // Get total count from the first page (same across all pages)
  const totalCount = data?.pages[0]?.total_count ?? 0;
  const loadedCount = allEntries.length;

  const items = useMemo<ZipBrowserItem[]>(() => {
    if (!allEntries.length) {
      return [];
    }

    const folders = new Map<string, number>(); // path -> total size of contents
    const files: ZipBrowserItem[] = [];

    allEntries.forEach(entry => {
      const filename = entry.filename;
      if (!filename.startsWith(internalPath)) {
        return;
      }

      const relative = filename.slice(internalPath.length);
      const slashIndex = relative.indexOf('/');

      if (slashIndex === -1) {
        // Direct file in current directory
        if (relative !== '' && !entry.is_directory) {
          files.push({
            name: relative,
            path: filename,
            isDir: false,
            size: entry.uncompressed_size
          });
        }
      } else {
        // File in a subdirectory - track the folder
        const folderPath = internalPath + relative.slice(0, slashIndex + 1);
        const currentSize = folders.get(folderPath) || 0;
        folders.set(folderPath, currentSize + entry.uncompressed_size);
      }
    });

    const folderItems: ZipBrowserItem[] = Array.from(folders.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, size]) => ({
        name: path.slice(internalPath.length).replace(/\/$/, ''),
        path,
        isDir: true,
        size
      }));

    const fileItems = files.sort((a, b) => a.name.localeCompare(b.name));

    return [...folderItems, ...fileItems];
  }, [allEntries, internalPath]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Typography className="text-foreground">
          Loading archive contents...
        </Typography>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <Typography className="text-error">Error: {error.message}</Typography>
      </div>
    );
  }

  if (selectedFile && fspName) {
    return (
      <InternalFileViewer
        fspName={fspName}
        internalPath={selectedFile}
        onBack={() => setSelectedFile(null)}
        ozxPath={ozxPath}
      />
    );
  }

  const navigateUp = () => {
    const parts = internalPath.split('/').filter(Boolean);
    parts.pop();
    setInternalPath(parts.length > 0 ? parts.join('/') + '/' : '');
  };

  const handleDownload = (itemPath: string, itemName: string) => {
    if (!fspName) {
      return;
    }
    const url = buildOzxContentUrl(fspName, ozxPath, itemPath);
    const link = document.createElement('a');
    link.href = url;
    link.download = itemName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Breadcrumb header with progress indicator */}
      <div className="p-2 bg-surface-light border-b border-surface flex items-center gap-2">
        {internalPath ? (
          <IconButton
            className="text-foreground"
            onClick={navigateUp}
            size="sm"
            variant="ghost"
          >
            <HiArrowLeft className="h-4 w-4" />
          </IconButton>
        ) : null}
        <Typography className="font-mono truncate flex-1" type="small">
          {file.name}/{internalPath}
        </Typography>
        {totalCount > 0 ? (
          <Typography
            className="text-surface-dark whitespace-nowrap"
            type="small"
          >
            {loadedCount} of {totalCount} entries
          </Typography>
        ) : null}
      </div>

      {/* Table view */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-light sticky top-0">
            <tr className="border-b border-surface">
              <th className="text-left p-2 font-medium text-foreground">
                Name
              </th>
              <th className="text-left p-2 font-medium text-foreground w-20">
                Type
              </th>
              <th className="text-right p-2 font-medium text-foreground w-24">
                Size
              </th>
              <th className="text-center p-2 font-medium text-foreground w-20">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr
                className="border-b border-surface hover:bg-surface-light transition-colors cursor-pointer"
                key={item.path}
                onClick={() => {
                  if (item.isDir) {
                    setInternalPath(item.path);
                  } else {
                    setSelectedFile(item.path);
                  }
                }}
              >
                <td className="p-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {item.isDir ? (
                      <HiOutlineFolder className="h-5 w-5 text-blue-500 flex-shrink-0" />
                    ) : (
                      <HiOutlineDocument className="h-5 w-5 text-gray-500 flex-shrink-0" />
                    )}
                    <Typography
                      className="font-mono text-foreground truncate"
                      type="small"
                    >
                      {item.name}
                    </Typography>
                  </div>
                </td>
                <td className="p-2">
                  <Typography className="text-foreground" type="small">
                    {item.isDir ? 'Folder' : 'File'}
                  </Typography>
                </td>
                <td className="p-2 text-right">
                  <Typography className="text-foreground" type="small">
                    {formatFileSize(item.size)}
                  </Typography>
                </td>
                <td className="p-2 text-center">
                  {!item.isDir ? (
                    <IconButton
                      className="text-foreground"
                      onClick={e => {
                        e.stopPropagation();
                        handleDownload(item.path, item.name);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      <HiOutlineDownload className="h-4 w-4" />
                    </IconButton>
                  ) : null}
                </td>
              </tr>
            ))}
            {items.length === 0 && !hasNextPage ? (
              <tr>
                <td className="p-4 text-center text-surface-dark" colSpan={4}>
                  This folder is empty
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {/* Load more button */}
        {hasNextPage ? (
          <div className="p-4 text-center border-t border-surface">
            <button
              className="px-4 py-2 text-sm font-medium text-foreground bg-surface-light hover:bg-surface border border-surface rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={isFetchingNextPage}
              onClick={() => fetchNextPage()}
              type="button"
            >
              {isFetchingNextPage
                ? 'Loading...'
                : `Load more entries (${loadedCount} of ${totalCount})`}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
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

  const isZip = isAnyZipFile(file);
  const contentQuery = useFileContentQuery(fspName, file.path, !isZip);
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
    if (isAnyZipFile(file)) {
      return <ZipBrowser file={file} />;
    }

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
