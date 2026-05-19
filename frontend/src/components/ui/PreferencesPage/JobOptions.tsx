import { useState } from 'react';
import toast from 'react-hot-toast';

import FgButton from '@/components/designSystem/atoms/FgButton';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import FgFormField from '@/components/designSystem/molecules/FgFormField';
import { usePreferencesContext } from '@/contexts/PreferencesContext';

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
    <div className="space-y-6">
      <div>
        <FgFormField
          helperText="Additional CLI arguments appended to every job submit command. Can be overridden per job on the Cluster tab."
          htmlFor="default-extra-args"
          label="Default extra arguments"
        >
          <FgInput
            className="max-w-md font-mono"
            onChange={e => setLocalExtraArgs(e.target.value)}
            placeholder="e.g. -P your_project"
            size="sm"
            type="text"
            value={localExtraArgs}
          />
        </FgFormField>
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
        <FgFormField
          helperText="Directory where Apptainer SIF images are cached. Defaults to ~/.fileglancer/apptainer_cache if not set."
          htmlFor="apptainer-cache-dir"
          label="Container cache directory"
        >
          <FgInput
            className="max-w-md font-mono"
            onChange={e => setLocalCacheDir(e.target.value)}
            placeholder="~/.fileglancer/apptainer_cache"
            size="sm"
            type="text"
            value={localCacheDir}
          />
        </FgFormField>
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
  );
}
