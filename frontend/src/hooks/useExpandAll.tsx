import { useState } from 'react';

import FgButton from '@/components/designSystem/atoms/FgButton';

/** Tracks which rows of a DatasetRow list are open, for Expand all. */
export function useExpandAll(keys: string[], toggleClassName = '') {
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(new Set());
  const allOpen = keys.length > 0 && keys.every(k => openKeys.has(k));
  const rowProps = (key: string) => ({
    open: openKeys.has(key),
    onOpenChange: (open: boolean) =>
      setOpenKeys(prev => {
        const next = new Set(prev);
        if (open) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      })
  });
  const toggle = (
    // Pinned to the top of the list's scroll container.
    <div
      className={`sticky top-0 z-10 flex justify-end bg-background ${toggleClassName}`}
    >
      <FgButton
        onClick={() => setOpenKeys(allOpen ? new Set() : new Set(keys))}
        size="sm"
        variant="ghost"
      >
        {allOpen ? 'Collapse all' : 'Expand all'}
      </FgButton>
    </div>
  );
  return { rowProps, toggle };
}
