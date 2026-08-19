import { useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';
import {
  HiOutlineDuplicate,
  HiOutlineDownload,
  HiOutlineExternalLink,
  HiOutlineArrowsExpand
} from 'react-icons/hi';

import { useViewStateByReadKey } from '@/queries/viewQueries';
import { useInternalNeuroglancerBaseUrl } from '@/hooks/useDefaultNeuroglancerBaseUrl';
import { constructNeuroglancerUrl } from '@/utils/neuroglancerUrl';
import { downloadTextFile } from '@/utils';
import { copyToClipboard } from '@/utils/copyText';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgLink from '@/components/designSystem/atoms/FgLink';

export default function NeuroglancerView() {
  const { readKey } = useParams();
  const stateQuery = useViewStateByReadKey(readKey);
  const baseUrl = useInternalNeuroglancerBaseUrl();
  const containerRef = useRef<HTMLDivElement>(null);
  const ngState = stateQuery.data;

  // Reflect the full state into the app's own URL hash so copy-pasting the
  // current page URL is a full-state shareable link, matching Neuroglancer's
  // own address-bar convention.
  // ponytail: hash is display/share only; if it should ever drive editable
  // state, that's the editable stack.
  useEffect(() => {
    if (!ngState) {
      return;
    }
    window.history.replaceState(
      window.history.state,
      '',
      '#!' + encodeURIComponent(JSON.stringify(ngState))
    );
  }, [ngState]);

  if (stateQuery.isPending) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Typography className="text-foreground">Loading View…</Typography>
      </div>
    );
  }

  if (stateQuery.isError || !ngState) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Typography className="text-foreground">View not found</Typography>
      </div>
    );
  }

  const title = (ngState.title as string) || 'Untitled View';
  const externalUrl = constructNeuroglancerUrl(ngState, baseUrl);

  const handleCopy = async () => {
    const shortLink = `${window.location.origin}/view/${readKey}`;
    const result = await copyToClipboard(shortLink);
    if (result.success) {
      toast.success('Neuroglancer link copied');
    } else {
      toast.error(`Failed to copy: ${result.error}`);
    }
  };

  const handleFullscreen = () => {
    // ponytail: native Fullscreen API on the container, deliberately scoped
    // to this component (excluding the app navbar) rather than the whole
    // route; no custom fullscreen state machine.
    void containerRef.current?.requestFullscreen?.();
  };

  return (
    <div
      className="flex h-full w-full flex-col bg-background"
      ref={containerRef}
    >
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-surface px-4 py-2">
        <div className="flex min-w-0 items-center gap-1 text-foreground/70">
          <FgLink size="sm" to="/ngviews">
            NG Views
          </FgLink>
          <Typography variant="small">/</Typography>
          <Typography className="truncate" variant="small">
            {title}
          </Typography>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <FgButton onClick={() => void handleCopy()} variant="ghost">
            <FgIcon icon={HiOutlineDuplicate} size="sm" /> Copy link
          </FgButton>
          <FgButton
            onClick={() =>
              downloadTextFile(
                JSON.stringify(ngState, null, 2),
                `${title}.json`
              )
            }
            variant="ghost"
          >
            <FgIcon icon={HiOutlineDownload} size="sm" /> Download JSON
          </FgButton>
          <FgButton
            onClick={() =>
              window.open(externalUrl, '_blank', 'noopener,noreferrer')
            }
            variant="ghost"
          >
            <FgIcon icon={HiOutlineExternalLink} size="sm" /> Open external
          </FgButton>
          <FgButton onClick={handleFullscreen} variant="ghost">
            <FgIcon icon={HiOutlineArrowsExpand} size="sm" /> Fullscreen
          </FgButton>
        </div>
      </div>
      <iframe
        className="flex-1 w-full border-0"
        src={externalUrl}
        title="Neuroglancer viewer"
      />
    </div>
  );
}
