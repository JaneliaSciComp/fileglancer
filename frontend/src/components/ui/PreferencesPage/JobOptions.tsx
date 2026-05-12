import { useState } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import FgButton from '@/components/designSystem/atoms/FgButton';

export default function JobOptions() {
  const {
    defaultExtraArgs,
    updateDefaultExtraArgs,
    apptainerCacheDir,
    updateApptainerCacheDir
  } = usePreferencesContext();

  const [localExtraArgs, setLocalExtraArgs] = useState(defaultExtraArgs);
  const [savingExtraArgs, setSavingExtraArgs] = useState(false);
  const isExtraArgsDirty = localExtraArgs !== defaultExtraArgs;

  const [localCacheDir, setLocalCacheDir] = useState(apptainerCacheDir);
  const [savingCacheDir, setSavingCacheDir] = useState(false);
  const isCacheDirDirty = localCacheDir !== apptainerCacheDir;

  const handleSaveExtraArgs = async () => {
    setSavingExtraArgs(true);
    const result = await updateDefaultExtraArgs(localExtraArgs.trim());
    setSavingExtraArgs(false);
    if (result.success) {
      toast.success('Default extra arguments saved');
    } else {
      toast.error(result.error);
    }
  };

  const handleSaveCacheDir = async () => {
    setSavingCacheDir(true);
    const result = await updateApptainerCacheDir(localCacheDir.trim());
    setSavingCacheDir(false);
    if (result.success) {
      toast.success('Container cache directory saved');
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div>
      <Typography className="font-semibold">Jobs</Typography>
      <div className="pl-4 mt-2 space-y-6">
        <div>
          <label
            className="block text-foreground text-sm mb-1"
            htmlFor="default-extra-args"
          >
            Default extra arguments
          </label>
          <Typography className="text-secondary mb-2" type="small">
            Additional CLI arguments appended to every job submit command. Can
            be overridden per job on the Cluster tab.
          </Typography>
          <input
            className="max-w-md w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary font-mono text-sm"
            id="default-extra-args"
            onChange={e => setLocalExtraArgs(e.target.value)}
            placeholder="e.g. -P your_project"
            type="text"
            value={localExtraArgs}
          />
          <FgButton
            disabled={!isExtraArgsDirty || savingExtraArgs}
            loading={savingExtraArgs}
            loadingText="Saving..."
            onClick={handleSaveExtraArgs}
            type="button"
          >
            Save
          </FgButton>
        </div>

        <div>
          <label
            className="block text-foreground text-sm mb-1"
            htmlFor="apptainer-cache-dir"
          >
            Container cache directory
          </label>
          <Typography className="text-secondary mb-2" type="small">
            Directory where Apptainer SIF images are cached. Defaults to{' '}
            <code>~/.fileglancer/apptainer_cache</code> if not set.
          </Typography>
          <input
            className="max-w-md w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary font-mono text-sm"
            id="apptainer-cache-dir"
            onChange={e => setLocalCacheDir(e.target.value)}
            placeholder="~/.fileglancer/apptainer_cache"
            type="text"
            value={localCacheDir}
          />
          <FgButton
            disabled={!isCacheDirDirty || savingCacheDir}
            loading={savingCacheDir}
            loadingText="Saving..."
            onClick={handleSaveCacheDir}
          >
            Save
          </FgButton>
        </div>
      </div>
    </div>
  );
}
