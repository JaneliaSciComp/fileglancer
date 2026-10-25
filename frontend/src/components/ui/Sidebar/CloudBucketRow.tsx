import { useState } from 'react';
import { IconButton } from '@material-tailwind/react';
import { BsBucket } from 'react-icons/bs';
import { HiOutlineTrash } from 'react-icons/hi2';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FileSharePathComponent from './FileSharePath';
import RemoveBucketDialog from '@/components/ui/Dialogs/RemoveBucket';
import type { FileSharePath } from '@/shared.types';

export default function CloudBucketRow({
  fsp
}: {
  readonly fsp: FileSharePath;
}) {
  const [showRemove, setShowRemove] = useState(false);

  return (
    <div className="flex items-center w-full">
      {/* Same class as the list so index.css indents the row like an FSP under a zone */}
      <div className="file-share-path-list flex-1 min-w-0">
        <FileSharePathComponent fsp={fsp} icon={BsBucket} />
      </div>
      <IconButton
        aria-label={`Remove bucket ${fsp.storage}`}
        className="min-w-0 min-h-0"
        isCircular
        onClick={() => setShowRemove(true)}
        variant="ghost"
      >
        <FgIcon
          className="short:icon-xsmall mb-[2px]"
          icon={HiOutlineTrash}
          size="sm"
        />
      </IconButton>
      <RemoveBucketDialog
        fsp={fsp}
        onClose={() => setShowRemove(false)}
        open={showRemove}
      />
    </div>
  );
}
