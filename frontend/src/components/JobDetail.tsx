import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { Button, Tabs, Typography } from '@material-tailwind/react';
import {
  HiOutlineArrowLeft,
  HiOutlineDownload,
  HiOutlineRefresh
} from 'react-icons/hi';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  materialDark,
  coy
} from 'react-syntax-highlighter/dist/esm/styles/prism';

import type { JobFileInfo, FileSharePath } from '@/shared.types';
import JobStatusBadge from '@/components/ui/AppsPage/JobStatusBadge';
import { formatDateString } from '@/utils';
import {
  getPreferredPathForDisplay,
  makeBrowseLink
} from '@/utils/pathHandling';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { useJobQuery, useJobFileQuery } from '@/queries/jobsQueries';

function FilePreview({
  content,
  language,
  isDarkMode
}: {
  readonly content: string | null | undefined;
  readonly language: string;
  readonly isDarkMode: boolean;
}) {
  if (content === undefined) {
    return (
      <Typography className="text-secondary p-4" type="small">
        Loading...
      </Typography>
    );
  }

  if (content === null) {
    return (
      <Typography className="text-secondary p-4 italic" type="small">
        File not available
      </Typography>
    );
  }

  const theme = isDarkMode ? materialDark : coy;
  const themeCodeStyles = theme['code[class*="language-"]'] || {};

  return (
    <div className="border border-primary-light rounded overflow-auto max-h-[70vh]">
      <SyntaxHighlighter
        codeTagProps={{
          style: {
            ...themeCodeStyles,
            paddingBottom: '2em'
          }
        }}
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
        style={theme}
        wrapLines={true}
        wrapLongLines={true}
      >
        {content}
      </SyntaxHighlighter>
    </div>
  );
}

function FilePathLink({
  fileInfo,
  pathPreference,
  zonesAndFspMap
}: {
  readonly fileInfo: JobFileInfo | undefined;
  readonly pathPreference: ['linux_path' | 'windows_path' | 'mac_path'];
  readonly zonesAndFspMap: Record<string, unknown>;
}) {
  if (!fileInfo?.fsp_name || !fileInfo.subpath) {
    return null;
  }

  // Find the FSP in the zones map to get platform-specific paths
  let fsp: FileSharePath | null = null;
  for (const value of Object.values(zonesAndFspMap)) {
    if (
      value &&
      typeof value === 'object' &&
      'name' in value &&
      (value as FileSharePath).name === fileInfo.fsp_name
    ) {
      fsp = value as FileSharePath;
      break;
    }
  }

  const displayPath = fsp
    ? getPreferredPathForDisplay(pathPreference, fsp, fileInfo.subpath)
    : fileInfo.path;

  const browseUrl = makeBrowseLink(fileInfo.fsp_name, fileInfo.subpath);

  return (
    <Link
      className="text-primary-light text-sm font-mono hover:underline"
      to={browseUrl}
    >
      {displayPath}
    </Link>
  );
}

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('parameters');

  const { pathPreference } = usePreferencesContext();
  const { zonesAndFspQuery } = useZoneAndFspMapContext();

  const id = jobId ? parseInt(jobId) : 0;
  const jobQuery = useJobQuery(id);
  const scriptQuery = useJobFileQuery(id, 'script');
  const stdoutQuery = useJobFileQuery(id, 'stdout');
  const stderrQuery = useJobFileQuery(id, 'stderr');

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

  const job = jobQuery.data;

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRelaunch = () => {
    if (!job) {
      return;
    }
    navigate('/apps/launch/relaunch', {
      state: {
        appUrl: job.app_url,
        manifestPath: job.manifest_path,
        entryPointId: job.entry_point_id,
        parameters: job.parameters
      }
    });
  };

  return (
    <div>
      <Button
        className="!rounded-md mb-6"
        onClick={() => navigate('/apps')}
        variant="outline"
      >
        <HiOutlineArrowLeft className="icon-small mr-2" />
        Back to Apps
      </Button>

      {jobQuery.isPending ? (
        <Typography className="text-secondary" type="small">
          Loading job details...
        </Typography>
      ) : jobQuery.isError ? (
        <div className="p-3 bg-error/10 rounded text-error text-sm">
          Failed to load job: {jobQuery.error?.message || 'Unknown error'}
        </div>
      ) : job ? (
        <div className="max-w-4xl">
          {/* Job Info Header */}
          <div className="mb-6">
            <Typography className="text-foreground font-bold mb-1" type="h5">
              {job.app_name} &mdash; {job.entry_point_name}
            </Typography>
            <div className="flex flex-wrap items-center gap-4 mt-2">
              <JobStatusBadge status={job.status} />
              <Typography className="text-secondary" type="small">
                Submitted: {formatDateString(job.created_at)}
              </Typography>
              {job.started_at ? (
                <Typography className="text-secondary" type="small">
                  Started: {formatDateString(job.started_at)}
                </Typography>
              ) : null}
              {job.finished_at ? (
                <Typography className="text-secondary" type="small">
                  Finished: {formatDateString(job.finished_at)}
                </Typography>
              ) : null}
              {job.exit_code !== null && job.exit_code !== undefined ? (
                <Typography className="text-secondary" type="small">
                  Exit code: {job.exit_code}
                </Typography>
              ) : null}
            </div>
          </div>

          {/* Tabs */}
          <Tabs onValueChange={setActiveTab} value={activeTab}>
            <Tabs.List className="justify-start items-stretch shrink-0 min-w-fit w-full py-2 bg-surface dark:bg-surface-light">
              <Tabs.Trigger
                className="!text-foreground h-full"
                value="parameters"
              >
                Parameters
              </Tabs.Trigger>
              <Tabs.Trigger className="!text-foreground h-full" value="script">
                Script
              </Tabs.Trigger>
              <Tabs.Trigger className="!text-foreground h-full" value="stdout">
                Output Log
              </Tabs.Trigger>
              <Tabs.Trigger className="!text-foreground h-full" value="stderr">
                Error Log
              </Tabs.Trigger>
              <Tabs.TriggerIndicator className="h-full" />
            </Tabs.List>

            <Tabs.Panel className="pt-4" value="parameters">
              {Object.keys(job.parameters).length > 0 ? (
                <div className="border border-primary-light rounded p-3 bg-surface/30">
                  {Object.entries(job.parameters).map(([key, value]) => (
                    <div className="flex gap-2 py-1" key={key}>
                      <Typography
                        className="text-secondary font-medium"
                        type="small"
                      >
                        {key}:
                      </Typography>
                      <Typography className="text-foreground" type="small">
                        {String(value)}
                      </Typography>
                    </div>
                  ))}
                </div>
              ) : (
                <Typography className="text-secondary italic" type="small">
                  No parameters
                </Typography>
              )}
              <Button
                className="!rounded-md mt-4"
                onClick={handleRelaunch}
                variant="outline"
              >
                <HiOutlineRefresh className="icon-small mr-2" />
                Relaunch
              </Button>
            </Tabs.Panel>

            <Tabs.Panel className="pt-4" value="script">
              <div className="flex items-center justify-between mb-2">
                <FilePathLink
                  fileInfo={job.files?.script}
                  pathPreference={pathPreference}
                  zonesAndFspMap={zonesAndFspQuery.data || {}}
                />
              </div>
              <FilePreview
                content={
                  scriptQuery.isPending ? undefined : (scriptQuery.data ?? null)
                }
                isDarkMode={isDarkMode}
                language="bash"
              />
            </Tabs.Panel>

            <Tabs.Panel className="pt-4" value="stdout">
              <div className="flex items-center justify-between mb-2">
                <FilePathLink
                  fileInfo={job.files?.stdout}
                  pathPreference={pathPreference}
                  zonesAndFspMap={zonesAndFspQuery.data || {}}
                />
                {stdoutQuery.data !== undefined && stdoutQuery.data !== null ? (
                  <Button
                    className="!rounded-md"
                    onClick={() =>
                      handleDownload(stdoutQuery.data!, `job-${id}-stdout.log`)
                    }
                    size="sm"
                    variant="outline"
                  >
                    <HiOutlineDownload className="icon-small mr-2" />
                    Download
                  </Button>
                ) : null}
              </div>
              <FilePreview
                content={
                  stdoutQuery.isPending ? undefined : (stdoutQuery.data ?? null)
                }
                isDarkMode={isDarkMode}
                language="text"
              />
            </Tabs.Panel>

            <Tabs.Panel className="pt-4" value="stderr">
              <div className="flex items-center justify-between mb-2">
                <FilePathLink
                  fileInfo={job.files?.stderr}
                  pathPreference={pathPreference}
                  zonesAndFspMap={zonesAndFspQuery.data || {}}
                />
                {stderrQuery.data !== undefined && stderrQuery.data !== null ? (
                  <Button
                    className="!rounded-md"
                    onClick={() =>
                      handleDownload(stderrQuery.data!, `job-${id}-stderr.log`)
                    }
                    size="sm"
                    variant="outline"
                  >
                    <HiOutlineDownload className="icon-small mr-2" />
                    Download
                  </Button>
                ) : null}
              </div>
              <FilePreview
                content={
                  stderrQuery.isPending ? undefined : (stderrQuery.data ?? null)
                }
                isDarkMode={isDarkMode}
                language="text"
              />
            </Tabs.Panel>
          </Tabs>
        </div>
      ) : null}
    </div>
  );
}
