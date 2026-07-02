import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { Card, Tabs, Typography } from '@material-tailwind/react';
import {
  HiExternalLink,
  HiOutlineArrowLeft,
  HiOutlineDownload,
  HiOutlineRefresh,
  HiOutlineStop
} from 'react-icons/hi';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  materialDark,
  coy
} from 'react-syntax-highlighter/dist/esm/styles/prism';

import AnsiText from '@/components/ui/AppsPage/AnsiText';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import CancelJobDialog from '@/components/ui/Dialogs/CancelJob';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import type {
  JobFileInfo,
  FileSharePath,
  AppLaunchParamsFile,
  AppResourceDefaults
} from '@/shared.types';
import JobStatusBadge from '@/components/ui/AppsPage/JobStatusBadge';
import {
  formatDateString,
  buildRelaunchPath,
  parseGithubUrl,
  buildGithubUrl,
  downloadTextFile,
  formatDuration,
  stripLsfFooter,
  tailLines,
  exitCodeMeaning
} from '@/utils';
import type { Job } from '@/shared.types';
import {
  getPreferredPathForDisplay,
  makeBrowseLink
} from '@/utils/pathHandling';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import {
  useJobQuery,
  useJobFileQuery,
  useCancelJobMutation
} from '@/queries/jobsQueries';
import FgExternalLink from './designSystem/atoms/FgExternalLink';

/** Drop null/undefined values so they aren't shown or persisted as parameters. */
function omitNullValues(
  record: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([, value]) => value !== null && value !== undefined
    )
  );
}

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
    return <Typography className="text-foreground p-4">Loading...</Typography>;
  }

  if (content === null) {
    return (
      <Typography className="text-foreground p-4 italic">
        File not available
      </Typography>
    );
  }

  if (language === 'text') {
    return <AnsiText content={content} isDarkMode={isDarkMode} />;
  }

  const theme = isDarkMode ? materialDark : coy;
  const themeCodeStyles = theme['code[class*="language-"]'] || {};

  return (
    <Card className="overflow-hidden dark:border-surface-light">
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
    </Card>
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
  const fileName = fileInfo.subpath.split('/').pop() || displayPath;

  return (
    <FgTooltip label={displayPath} triggerClasses="inline-flex max-w-full">
      <Link
        className="text-primary-dark text-sm font-mono hover:underline truncate"
        to={browseUrl}
      >
        {fileName}
      </Link>
    </FgTooltip>
  );
}

/** The file's real name on disk, falling back to a generated name. */
function jobFileName(
  fileInfo: JobFileInfo | undefined,
  fallback: string
): string {
  return fileInfo?.subpath?.split('/').pop() || fallback;
}

/** Right-aligned plain download icon, matching the file browser's download control. */
function FileDownloadButton({
  content,
  filename
}: {
  readonly content: string;
  readonly filename: string;
}) {
  return (
    <button
      className="ml-auto cursor-pointer"
      onClick={() => downloadTextFile(content, filename, 'text/plain')}
      title="Download file"
      type="button"
    >
      <FgIcon
        className="text-foreground hover:text-primary text-xl"
        icon={HiOutlineDownload}
      />
    </button>
  );
}

/** A titled card holding a small set of label/value rows. */
function InfoCard({
  title,
  children,
  className
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={`flex flex-col h-full${className ? ` ${className}` : ''}`}>
      <Typography className="text-foreground font-bold mb-1">
        {title}
      </Typography>
      <Card className="p-3 dark:border-surface-light grow">{children}</Card>
    </div>
  );
}

/** A label/value row; renders nothing when the value is empty. */
function InfoRow({
  label,
  value,
  truncate = false
}: {
  readonly label: string;
  readonly value: ReactNode;
  // When true, render the value as a single line clipped with an ellipsis
  // (full text shown on hover) instead of wrapping across multiple lines.
  readonly truncate?: boolean;
}) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return (
    <div className="flex gap-2 py-1 items-baseline">
      <Typography className="text-foreground text-sm font-semibold shrink-0">
        {label}:
      </Typography>
      <Typography
        className={`text-foreground ${truncate ? 'truncate min-w-0 flex-1' : 'whitespace-pre-wrap break-all'}`}
        title={truncate && typeof value === 'string' ? value : undefined}
      >
        {value}
      </Typography>
    </div>
  );
}

/**
 * Best-effort GitHub repo link for an app manifest URL; null if not parseable.
 * The label is "owner/repo", with "(branch)" appended when a non-default branch
 * is specified.
 */
function appRepoLink(appUrl: string): { href: string; label: string } | null {
  try {
    const { owner, repo, branch } = parseGithubUrl(appUrl);
    const label =
      branch && branch !== 'main'
        ? `${owner}/${repo} (${branch})`
        : `${owner}/${repo}`;
    return { href: buildGithubUrl(owner, repo, branch), label };
  } catch {
    return null;
  }
}

const RECENT_OUTPUT_LINES = 20;

/** The job Overview tab: status, execution details, recent output. */
function JobOverview({
  job,
  stdoutContent,
  stderrContent,
  stdoutPending,
  isDarkMode,
  onViewStdout,
  onViewStderr
}: {
  readonly job: Job;
  readonly stdoutContent: string | null | undefined;
  readonly stderrContent: string | null | undefined;
  readonly stdoutPending: boolean;
  readonly isDarkMode: boolean;
  readonly onViewStdout: () => void;
  readonly onViewStderr: () => void;
}) {
  const isActive = job.status === 'PENDING' || job.status === 'RUNNING';
  const runtime = formatDuration(job.started_at, job.finished_at);
  const queueWait = job.started_at
    ? formatDuration(job.created_at, job.started_at)
    : null;
  const exitMeaning = exitCodeMeaning(job.exit_code);
  const repoLink = appRepoLink(job.app_url);

  const stdoutTail =
    stdoutContent !== null && stdoutContent !== undefined
      ? tailLines(stripLsfFooter(stdoutContent), RECENT_OUTPUT_LINES)
      : null;
  const stderrTail =
    stderrContent !== null && stderrContent !== undefined
      ? tailLines(stripLsfFooter(stderrContent), RECENT_OUTPUT_LINES)
      : null;
  const hasStderr = Boolean(stderrTail && stderrTail.trim());

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <InfoCard className="md:col-span-2" title="Status">
          <InfoRow label={isActive ? 'Elapsed' : 'Runtime'} value={runtime} />
          <InfoRow label="Queue wait" value={queueWait} />
          <InfoRow label="Submitted" value={formatDateString(job.created_at)} />
          <InfoRow
            label="Started"
            value={job.started_at ? formatDateString(job.started_at) : null}
          />
          <InfoRow
            label="Finished"
            value={job.finished_at ? formatDateString(job.finished_at) : null}
          />
          <InfoRow
            label="Exit code"
            value={
              job.exit_code !== null && job.exit_code !== undefined
                ? `${job.exit_code}${exitMeaning ? ` (${exitMeaning})` : ''}`
                : null
            }
          />
        </InfoCard>

        <InfoCard className="md:col-span-3" title="Execution">
          <InfoRow
            label="App"
            value={`${job.app_name} — ${job.entry_point_name}`}
          />
          <InfoRow
            label="Repository"
            value={
              repoLink ? (
                <FgExternalLink href={repoLink.href}>
                  {repoLink.label}
                </FgExternalLink>
              ) : null
            }
          />
          <InfoRow
            label="Type"
            value={job.entry_point_type === 'service' ? 'Service' : 'Batch job'}
          />
          {job.requirements && job.requirements.length > 0 ? (
            <div className="flex gap-2 py-1 items-baseline flex-wrap">
              <Typography className="text-foreground text-sm font-semibold shrink-0">
                Runtime:
              </Typography>
              {job.requirements.map(req => (
                <span
                  className="px-2 py-0.5 rounded bg-surface-light text-foreground text-xs font-mono"
                  key={req}
                >
                  {req}
                </span>
              ))}
            </div>
          ) : null}
          <InfoRow label="Command" truncate value={job.command} />
          <InfoRow label="Container" value={job.container} />
          <InfoRow label="Container args" value={job.container_args} />
          <InfoRow label="Conda env" value={job.conda_env} />
          <InfoRow label="Cluster job" value={job.cluster_job_id} />
        </InfoCard>
      </div>

      {job.started_at ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <Typography className="text-foreground font-bold">
              Recent output
            </Typography>
            <button
              className="text-primary-dark text-sm hover:underline cursor-pointer"
              onClick={onViewStdout}
              type="button"
            >
              Full log &rarr;
            </button>
          </div>
          <FilePreview
            content={stdoutPending ? undefined : (stdoutTail ?? null)}
            isDarkMode={isDarkMode}
            language="text"
          />
        </div>
      ) : null}

      {hasStderr ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <Typography className="text-error font-bold">
              Recent errors
            </Typography>
            <button
              className="text-primary-dark text-sm hover:underline cursor-pointer"
              onClick={onViewStderr}
              type="button"
            >
              Full error log &rarr;
            </button>
          </div>
          <FilePreview
            content={stderrTail}
            isDarkMode={isDarkMode}
            language="text"
          />
        </div>
      ) : null}
    </div>
  );
}

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  const { pathPreference } = usePreferencesContext();
  const { zonesAndFspQuery } = useZoneAndFspMapContext();

  const id = jobId ? parseInt(jobId) : 0;
  const jobQuery = useJobQuery(id);
  const jobStatus = jobQuery.data?.status;
  // Lazily fetch each file's content only when its tab is active, so the first
  // load of a job doesn't block on fetching all three log files at once. The
  // Overview tab also shows tails of stdout/stderr, so fetch those when it's
  // active (shared query keys keep this cached when switching to the log tabs).
  const scriptQuery = useJobFileQuery(
    id,
    'script',
    undefined,
    activeTab === 'script'
  );
  const stdoutQuery = useJobFileQuery(
    id,
    'stdout',
    jobStatus,
    activeTab === 'stdout' || activeTab === 'overview'
  );
  const stderrQuery = useJobFileQuery(
    id,
    'stderr',
    jobStatus,
    activeTab === 'stderr' || activeTab === 'overview'
  );
  const cancelMutation = useCancelJobMutation();

  const isService = jobQuery.data?.entry_point_type === 'service';
  const isActive = jobStatus === 'PENDING' || jobStatus === 'RUNNING';

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

  // Download the full set of parameters used for this job (all three tabs of
  // the launch form) as a JSON file that can be re-uploaded to relaunch.
  const handleDownloadParams = () => {
    if (!job) {
      return;
    }
    const params: AppLaunchParamsFile = {};
    const parameters = omitNullValues(job.parameters);
    if (Object.keys(parameters).length > 0) {
      params.parameters = parameters;
    }
    const envParameters = job.env_parameters
      ? omitNullValues(job.env_parameters)
      : {};
    if (Object.keys(envParameters).length > 0) {
      params.env_parameters = envParameters;
    }
    const resources = job.resources ? omitNullValues(job.resources) : {};
    if (Object.keys(resources).length > 0) {
      params.resources = resources as AppResourceDefaults;
    }
    if (job.env && Object.keys(job.env).length > 0) {
      params.env = job.env;
    }
    if (job.pre_run) {
      params.pre_run = job.pre_run;
    }
    if (job.post_run) {
      params.post_run = job.post_run;
    }
    if (job.container) {
      params.container = job.container;
    }
    if (job.container_args) {
      params.container_args = job.container_args;
    }
    downloadTextFile(JSON.stringify(params, null, 2), `job-${id}-params.json`);
  };

  const handleRelaunch = () => {
    if (!job) {
      return;
    }
    const { owner, repo, branch } = parseGithubUrl(job.app_url);
    const path = buildRelaunchPath(
      owner,
      repo,
      branch,
      job.entry_point_id,
      job.manifest_path || undefined
    );
    navigate(path, {
      state: {
        parameters: job.parameters,
        env_parameters: job.env_parameters,
        resources: job.resources,
        env: job.env,
        pre_run: job.pre_run,
        post_run: job.post_run,
        container: job.container,
        container_args: job.container_args
      }
    });
  };

  return (
    <div>
      <FgButton
        className="mb-6"
        icon={HiOutlineArrowLeft}
        onClick={() => navigate('/apps/jobs')}
        variant="outline"
      >
        Back to Jobs
      </FgButton>

      {jobQuery.isPending ? (
        <div className="animate-pulse">
          {/* Title skeleton */}
          <div className="mb-6">
            <div className="w-72 h-6 bg-surface rounded mb-3" />
            <div className="flex items-center gap-4 mt-2">
              <div className="w-20 h-5 bg-surface rounded-full" />
              <div className="w-36 h-4 bg-surface rounded" />
              <div className="w-36 h-4 bg-surface rounded" />
            </div>
          </div>
          {/* Tab bar skeleton */}
          <div className="flex gap-4 py-2 mb-4 border-b border-surface">
            <div className="w-24 h-4 bg-surface rounded" />
            <div className="w-16 h-4 bg-surface rounded" />
            <div className="w-24 h-4 bg-surface rounded" />
            <div className="w-20 h-4 bg-surface rounded" />
          </div>
          {/* Content area skeleton */}
          <div className="mt-4 space-y-2">
            <div className="w-full h-4 bg-surface rounded" />
            <div className="w-3/4 h-4 bg-surface rounded" />
            <div className="w-1/2 h-4 bg-surface rounded" />
          </div>
        </div>
      ) : jobQuery.isError ? (
        <div className="p-3 bg-error/10 rounded text-error text-sm">
          Failed to load job: {jobQuery.error?.message || 'Unknown error'}
        </div>
      ) : job ? (
        <div>
          {/* Job Info Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Typography className="font-bold truncate" type="h5">
                  {job.app_name} &mdash; {job.entry_point_name}
                </Typography>
                <JobStatusBadge status={job.status} />
              </div>
              <div className="flex items-center gap-2">
                <FgButton
                  className="!rounded-md whitespace-nowrap"
                  icon={HiOutlineDownload}
                  onClick={handleDownloadParams}
                  variant="outline"
                >
                  Export params
                </FgButton>
                {isActive ? (
                  <FgButton
                    color="error"
                    disabled={cancelMutation.isPending}
                    icon={HiOutlineStop}
                    loading={cancelMutation.isPending}
                    loadingText="Cancelling"
                    onClick={() => setShowStopConfirm(true)}
                    variant="outline"
                  >
                    Cancel
                  </FgButton>
                ) : (
                  <FgButton
                    icon={HiOutlineRefresh}
                    onClick={handleRelaunch}
                    variant="outline"
                  >
                    Relaunch
                  </FgButton>
                )}
              </div>
            </div>
          </div>

          {/* Service URL banner */}
          {isService && job.status === 'RUNNING' ? (
            job.service_url ? (
              <div className="mb-4 p-3 flex items-center gap-3 border border-success rounded-lg bg-success/10">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
                </span>
                <Typography
                  as="div"
                  className="text-foreground flex-1 min-w-0 flex items-center gap-1"
                >
                  <span className="shrink-0">Service is running at</span>
                  <a
                    className="text-primary-dark hover:underline font-mono truncate min-w-0"
                    href={job.service_url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {job.service_url}
                  </a>
                </Typography>
                <FgButton
                  color="error"
                  disabled={cancelMutation.isPending}
                  icon={HiOutlineStop}
                  loading={cancelMutation.isPending}
                  loadingText="Stopping"
                  onClick={() => setShowStopConfirm(true)}
                  size="sm"
                >
                  Stop Service
                </FgButton>
                <FgButton
                  href={job.service_url}
                  icon={HiExternalLink}
                  iconPosition="right"
                  rel="noopener noreferrer"
                  size="sm"
                  target="_blank"
                >
                  Open Service
                </FgButton>
              </div>
            ) : (
              <div className="mb-4 p-3 flex items-center gap-3 border border-warning rounded-lg bg-warning/10">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-warning" />
                </span>
                <Typography className="text-foreground flex-1">
                  Service is starting up...
                </Typography>
                <FgButton
                  color="error"
                  disabled={cancelMutation.isPending}
                  loading={cancelMutation.isPending}
                  loadingText="Stopping..."
                  onClick={() => setShowStopConfirm(true)}
                  size="sm"
                >
                  Stop Service
                </FgButton>
              </div>
            )
          ) : null}

          {/* Cancel/Stop confirmation dialog */}
          <CancelJobDialog
            isPending={cancelMutation.isPending}
            isService={isService}
            onClose={() => setShowStopConfirm(false)}
            onConfirm={() => {
              cancelMutation.mutate(job.id);
              setShowStopConfirm(false);
            }}
            open={showStopConfirm}
          />

          {/* Tabs */}
          <Tabs onValueChange={setActiveTab} value={activeTab}>
            <Tabs.List className="justify-start items-stretch shrink-0 min-w-fit w-full py-2 bg-surface dark:bg-surface-light">
              <Tabs.Trigger
                className="!text-foreground h-full"
                value="overview"
              >
                Overview
              </Tabs.Trigger>
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

            <Tabs.Panel className="pt-4" value="overview">
              <JobOverview
                isDarkMode={isDarkMode}
                job={job}
                onViewStderr={() => setActiveTab('stderr')}
                onViewStdout={() => setActiveTab('stdout')}
                stderrContent={stderrQuery.data}
                stdoutContent={stdoutQuery.data}
                stdoutPending={stdoutQuery.isPending}
              />
            </Tabs.Panel>

            <Tabs.Panel className="pt-4" value="parameters">
              {(() => {
                const sections: {
                  title: string;
                  entries: [string, unknown][];
                }[] = [];
                const parameters = omitNullValues(job.parameters);
                if (Object.keys(parameters).length > 0) {
                  sections.push({
                    title: 'Parameters',
                    entries: Object.entries(parameters)
                  });
                }
                const envParameters = job.env_parameters
                  ? omitNullValues(job.env_parameters)
                  : {};
                if (Object.keys(envParameters).length > 0) {
                  sections.push({
                    title: 'Environment parameters',
                    entries: Object.entries(envParameters)
                  });
                }
                const resources = job.resources
                  ? omitNullValues(job.resources)
                  : {};
                if (Object.keys(resources).length > 0) {
                  sections.push({
                    title: 'Cluster',
                    entries: Object.entries(resources)
                  });
                }
                if (job.env && Object.keys(job.env).length > 0) {
                  sections.push({
                    title: 'Environment',
                    entries: Object.entries(job.env)
                  });
                }
                const other: [string, unknown][] = [];
                if (job.pre_run) {
                  other.push(['pre_run', job.pre_run]);
                }
                if (job.post_run) {
                  other.push(['post_run', job.post_run]);
                }
                if (job.container) {
                  other.push(['container', job.container]);
                }
                if (job.container_args) {
                  other.push(['container_args', job.container_args]);
                }
                if (other.length > 0) {
                  sections.push({ title: 'Other', entries: other });
                }

                return sections.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {sections.map(section => (
                      <div key={section.title}>
                        <Typography className="text-foreground font-bold mb-1">
                          {section.title}
                        </Typography>
                        <Card className="p-3 dark:border-surface-light">
                          {section.entries.map(([key, value]) => (
                            <div className="flex gap-2 py-1" key={key}>
                              <Typography className="text-foreground font-semibold shrink-0">
                                {key}:
                              </Typography>
                              <Typography className="text-foreground whitespace-pre-wrap break-all">
                                {String(value)}
                              </Typography>
                            </div>
                          ))}
                        </Card>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Typography className="text-foreground italic">
                    No parameters
                  </Typography>
                );
              })()}
            </Tabs.Panel>

            <Tabs.Panel className="pt-4" value="script">
              <div className="flex items-center justify-between mb-2">
                <FilePathLink
                  fileInfo={job.files?.script}
                  pathPreference={pathPreference}
                  zonesAndFspMap={zonesAndFspQuery.data || {}}
                />
                {scriptQuery.data !== undefined && scriptQuery.data !== null ? (
                  <FileDownloadButton
                    content={scriptQuery.data}
                    filename={jobFileName(
                      job.files?.script,
                      `job-${id}-script.sh`
                    )}
                  />
                ) : null}
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
                  <FileDownloadButton
                    content={stdoutQuery.data}
                    filename={jobFileName(
                      job.files?.stdout,
                      `job-${id}-stdout.log`
                    )}
                  />
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
                  <FileDownloadButton
                    content={stderrQuery.data}
                    filename={jobFileName(
                      job.files?.stderr,
                      `job-${id}-stderr.log`
                    )}
                  />
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
