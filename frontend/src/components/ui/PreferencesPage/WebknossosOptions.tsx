import { useState } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgButton from '@/components/designSystem/atoms/FgButton';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import FgFormField from '@/components/designSystem/molecules/FgFormField';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useViewersContext, type ValidViewer } from '@/contexts/ViewersContext';
import { resolveViewerTemplate, withHost } from '@/utils/viewerUrl';

/** Lets a user send WEBKNOSSOS links to their own WEBKNOSSOS host. */
export default function WebknossosOptions() {
  const { validViewers } = useViewersContext();
  const { viewerUrlSources } = usePreferencesContext();
  const viewer = validViewers.find(v => v.key === 'webknossos');
  if (!viewer) {
    return null;
  }
  const savedHost = new URL(
    resolveViewerTemplate(viewer, viewerUrlSources['webknossos'])
  ).host;
  // Keyed on the saved host so the field resets once preferences load.
  return (
    <WebknossosHostField
      key={savedHost}
      savedHost={savedHost}
      viewer={viewer}
    />
  );
}

function WebknossosHostField({
  savedHost,
  viewer
}: {
  readonly savedHost: string;
  readonly viewer: ValidViewer;
}) {
  const { setViewerUrlSource } = usePreferencesContext();
  const defaultHost = new URL(viewer.urlTemplate).host;

  const [localHost, setLocalHost] = useState(savedHost);
  const [saving, setSaving] = useState(false);
  const template = withHost(viewer.urlTemplate, localHost);
  const isDirty = localHost.trim() !== savedHost;

  const handleSave = async () => {
    if (!template) {
      return;
    }
    setSaving(true);
    // Saving the deployment's own host clears the override.
    const result = await setViewerUrlSource(
      'webknossos',
      template === viewer.urlTemplate ? 'configured' : { custom: template }
    );
    setSaving(false);
    if (result.success) {
      toast.success('WEBKNOSSOS host saved');
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div>
      <Typography className="font-semibold mb-4" type="lead">
        WEBKNOSSOS
      </Typography>
      <div className="pl-4 max-w-md">
        <FgFormField
          error={
            localHost.trim() && !template
              ? 'Enter a host name, such as wk.example.org'
              : undefined
          }
          helperText={`The WEBKNOSSOS server that the WEBKNOSSOS button imports datasets into. Defaults to ${defaultHost}.`}
          htmlFor="webknossos-host"
          label="WEBKNOSSOS host"
        >
          <FgInput
            className="max-w-md font-mono"
            onChange={e => setLocalHost(e.target.value)}
            placeholder={defaultHost}
            size="sm"
            type="text"
            value={localHost}
          />
        </FgFormField>
        <FgButton
          disabled={!isDirty || !template || saving}
          loading={saving}
          loadingText="Saving..."
          onClick={handleSave}
          type="button"
        >
          Save
        </FgButton>
      </div>
    </div>
  );
}
