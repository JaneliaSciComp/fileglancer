import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { Button, Typography } from '@material-tailwind/react';
import { HiOutlineArrowLeft } from 'react-icons/hi';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  materialDark,
  coy
} from 'react-syntax-highlighter/dist/esm/styles/prism';

import JobStatusBadge from '@/components/ui/AppsPage/JobStatusBadge';
import { formatDateString } from '@/utils';
import { useJobQuery, useJobFileQuery } from '@/queries/jobsQueries';

function FilePreview({
  title,
  content,
  language,
  isDarkMode
}: {
  readonly title: string;
  readonly content: string | null | undefined;
  readonly language: string;
  readonly isDarkMode: boolean;
}) {
  if (content === undefined) {
    return (
      <div className="mb-6">
        <Typography className="text-foreground font-medium mb-2" type="h6">
          {title}
        </Typography>
        <Typography className="text-secondary p-4" type="small">
          Loading...
        </Typography>
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="mb-6">
        <Typography className="text-foreground font-medium mb-2" type="h6">
          {title}
        </Typography>
        <Typography className="text-secondary p-4 italic" type="small">
          File not available
        </Typography>
      </div>
    );
  }

  const theme = isDarkMode ? materialDark : coy;
  const themeCodeStyles = theme['code[class*="language-"]'] || {};

  return (
    <div className="mb-6">
      <Typography className="text-foreground font-medium mb-2" type="h6">
        {title}
      </Typography>
      <div className="border border-primary-light rounded overflow-auto max-h-96">
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
    </div>
  );
}

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = useState(false);

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

          {/* Parameters */}
          {Object.keys(job.parameters).length > 0 ? (
            <div className="mb-6">
              <Typography
                className="text-foreground font-medium mb-2"
                type="h6"
              >
                Parameters
              </Typography>
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
            </div>
          ) : null}

          {/* File Previews */}
          <FilePreview
            content={
              scriptQuery.isPending ? undefined : (scriptQuery.data ?? null)
            }
            isDarkMode={isDarkMode}
            language="bash"
            title="Script"
          />
          <FilePreview
            content={
              stdoutQuery.isPending ? undefined : (stdoutQuery.data ?? null)
            }
            isDarkMode={isDarkMode}
            language="text"
            title="Standard Output"
          />
          <FilePreview
            content={
              stderrQuery.isPending ? undefined : (stderrQuery.data ?? null)
            }
            isDarkMode={isDarkMode}
            language="text"
            title="Standard Error"
          />
        </div>
      ) : null}
    </div>
  );
}
