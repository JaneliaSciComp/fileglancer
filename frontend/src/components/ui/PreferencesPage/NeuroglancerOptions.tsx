import toast from 'react-hot-toast';

import FgSwitch from '@/components/designSystem/atoms/formElements/FgSwitch';
import FgRadio from '@/components/designSystem/atoms/formElements/FgRadio';
import FgFieldSet from '@/components/designSystem/molecules/FgFieldSet';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useViewersContext } from '@/contexts/ViewersContext';

/** Best-effort hostname for display; falls back to the raw template. */
function hostLabel(template: string): string {
  try {
    return new URL(template).hostname;
  } catch {
    return template;
  }
}

export default function NeuroglancerOptions() {
  const {
    useLegacyMultichannelApproach,
    toggleUseLegacyMultichannelApproach,
    disableNeuroglancerStateGeneration,
    toggleDisableNeuroglancerStateGeneration,
    disableHeuristicalLayerTypeDetection,
    toggleDisableHeuristicalLayerTypeDetection,
    viewerUrlSources,
    setViewerUrlSource
  } = usePreferencesContext();
  const { validViewers } = useViewersContext();

  const neuroglancer = validViewers.find(v => v.key === 'neuroglancer');

  // Only offer the URL choice when the deployment overrides the Neuroglancer URL
  // (i.e. the configured template differs from the manifest default). Otherwise
  // both options resolve to the same URL and the control is meaningless.
  const showUrlSourceChoice =
    !!neuroglancer &&
    !!neuroglancer.manifestTemplateUrl &&
    neuroglancer.manifestTemplateUrl !== neuroglancer.urlTemplate;

  const currentSource =
    viewerUrlSources['neuroglancer'] === 'manifest' ? 'manifest' : 'configured';

  const handleUrlSourceChange = async (source: 'configured' | 'manifest') => {
    const result = await setViewerUrlSource('neuroglancer', source);
    if (result.success) {
      toast.success('Neuroglancer URL preference updated');
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-4">
      {showUrlSourceChoice ? (
        <FgFieldSet legend="Base URL">
          <FgRadio
            checked={currentSource === 'configured'}
            color="primary"
            id="neuroglancer_url_configured"
            label={`Internal Neuroglancer (${hostLabel(neuroglancer.urlTemplate)})`}
            name="neuroglancer_url_source"
            onChange={() => handleUrlSourceChange('configured')}
            value="configured"
          />
          <FgRadio
            checked={currentSource === 'manifest'}
            color="primary"
            id="neuroglancer_url_manifest"
            label={`External Neuroglancer (${hostLabel(neuroglancer.manifestTemplateUrl)})`}
            name="neuroglancer_url_source"
            onChange={() => handleUrlSourceChange('manifest')}
            value="manifest"
          />
        </FgFieldSet>
      ) : null}
      <FgFieldSet legend="State generation options">
        <FgSwitch
          checked={useLegacyMultichannelApproach ?? false}
          id="use_legacy_multichannel_approach"
          label="Generate multichannel state for Neuroglancer"
          onChange={async () => {
            const result = await toggleUseLegacyMultichannelApproach();
            if (result.success) {
              toast.success(
                useLegacyMultichannelApproach
                  ? 'Disabled multichannel state generation for Neuroglancer'
                  : 'Enabled multichannel state generation for Neuroglancer'
              );
            } else {
              toast.error(result.error);
            }
          }}
          showState
        />
        <FgSwitch
          checked={disableNeuroglancerStateGeneration}
          id="disable_neuroglancer_state_generation"
          label="Disable Neuroglancer state generation"
          onChange={async () => {
            const result = await toggleDisableNeuroglancerStateGeneration();
            if (result.success) {
              toast.success(
                disableNeuroglancerStateGeneration
                  ? 'Neuroglancer state generation is now enabled'
                  : 'Neuroglancer state generation is now disabled'
              );
            } else {
              toast.error(result.error);
            }
          }}
          showState
        />
        <FgSwitch
          checked={disableHeuristicalLayerTypeDetection ?? false}
          id="disable_heuristical_layer_type_detection"
          label="Disable heuristical layer type determination"
          onChange={async () => {
            const result = await toggleDisableHeuristicalLayerTypeDetection();
            if (result.success) {
              toast.success(
                disableHeuristicalLayerTypeDetection
                  ? 'Heuristical layer type determination is now enabled'
                  : 'Heuristical layer type determination is now disabled'
              );
            } else {
              toast.error(result.error);
            }
          }}
          showState
        />
      </FgFieldSet>
    </div>
  );
}
