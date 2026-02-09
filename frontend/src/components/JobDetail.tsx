import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { Button, Tabs, Typography } from '@material-tailwind/react';
import { HiOutlineArrowLeft, HiOutlineRefresh } from 'react-icons/hi';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  materialDark,
  coy
} from 'react-syntax-highlighter/dist/esm/styles/prism';

import JobStatusBadge from '@/components/ui/AppsPage/JobStatusBadge';
import { formatDateString } from '@/utils';
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

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('parameters');

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

  const handleRelaunch = () => {
    if (!job) {
      return;
    }
    navigate('/apps/launch/relaunch', {
      state: {
        appUrl: job.app_url,
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
                Relaunch with these parameters
              </Button>
            </Tabs.Panel>

            <Tabs.Panel className="pt-4" value="script">
              <FilePreview
                content={
                  scriptQuery.isPending ? undefined : (scriptQuery.data ?? null)
                }
                isDarkMode={isDarkMode}
                language="bash"
              />
            </Tabs.Panel>

            <Tabs.Panel className="pt-4" value="stdout">
              <FilePreview
                content={
                  stdoutQuery.isPending ? undefined : (stdoutQuery.data ?? null)
                }
                isDarkMode={isDarkMode}
                language="text"
              />
            </Tabs.Panel>

            <Tabs.Panel className="pt-4" value="stderr">
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
