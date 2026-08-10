import { useRef } from 'react';
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

export default function NeuroglancerView() {
  const { readKey } = useParams();
  const stateQuery = useViewStateByReadKey(readKey);
  const baseUrl = useInternalNeuroglancerBaseUrl();
  const containerRef = useRef<HTMLDivElement>(null);

  if (stateQuery.isPending) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Typography className="text-foreground">Loading View…</Typography>
      </div>
    );
  }

  const ngState = stateQuery.data;
  if (stateQuery.isError || !ngState) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Typography className="text-foreground">View not found</Typography>
      </div>
    );
  }

  const title = (ngState.title as string) || 'Neuroglancer View';
  const externalUrl = constructNeuroglancerUrl(ngState, baseUrl);

  const handleCopy = async () => {
    const result = await copyToClipboard(externalUrl);
    if (result.success) {
      toast.success('Neuroglancer link copied');
    } else {
      toast.error(`Failed to copy: ${result.error}`);
    }
  };

  const handleFullscreen = () => {
    // ponytail: native Fullscreen API on the container — the /view route is
    // already chrome-less, so this just drops the top bar into the OS
    // fullscreen; no custom fullscreen state machine.
    void containerRef.current?.requestFullscreen?.();
  };

  return (
    <div
      className="flex h-full w-full flex-col bg-background"
      ref={containerRef}
    >
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-surface px-4 py-2">
        <Typography
          className="truncate text-foreground font-semibold"
          type="h6"
        >
          {title}
        </Typography>
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
