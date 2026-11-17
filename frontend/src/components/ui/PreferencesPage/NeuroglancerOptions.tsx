import toast from 'react-hot-toast';
import { Typography } from '@material-tailwind/react';

import FgSwitch from '@/components/designSystem/atoms/formElements/FgSwitch';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import FgRadio from '@/components/designSystem/atoms/formElements/FgRadio';
import FgFieldSet from '@/components/designSystem/molecules/FgFieldSet';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import type {
  NeuroglancerButtonTarget,
  ViewerUrlSource
} from '@/contexts/PreferencesContext';
import { useViewersContext } from '@/contexts/ViewersContext';
import type { Result } from '@/shared.types';

/** Best-effort hostname for display; falls back to the raw template. */
function hostLabel(template: string): string {
  try {
    return new URL(template).hostname;
  } catch {
    return template;
  }
}

function BaseUrlChoice({
  hosts,
  idPrefix,
  legend,
  onChange,
  source
}: {
  readonly hosts: { internal: string; public: string };
  readonly idPrefix: string;
  readonly legend: string;
  readonly onChange: (source: 'configured' | 'manifest') => void;
  readonly source: ViewerUrlSource | undefined;
}) {
  const current = source === 'manifest' ? 'manifest' : 'configured';
  return (
    <FgFieldSet legend={legend}>
      <FgRadio
        checked={current === 'configured'}
        color="primary"
        id={`${idPrefix}_configured`}
        label={`Internal — hosted by your institution (${hosts.internal})`}
        name={idPrefix}
        onChange={() => onChange('configured')}
        value="configured"
      />
      <FgRadio
        checked={current === 'manifest'}
        color="primary"
        id={`${idPrefix}_manifest`}
        label={`Public — ${hosts.public}`}
        name={idPrefix}
        onChange={() => onChange('manifest')}
        value="manifest"
      />
    </FgFieldSet>
  );
}

function SubHeading({ children }: { readonly children: string }) {
  return (
    <Typography className="font-semibold text-foreground">
      {children}
    </Typography>
  );
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
    setViewerUrlSource,
    neuroglancerButtonTarget,
    setNeuroglancerButtonTarget,
    viewsNeuroglancerUrlSource,
    setViewsNeuroglancerUrlSource
  } = usePreferencesContext();
  const { validViewers } = useViewersContext();

  const neuroglancer = validViewers.find(v => v.key === 'neuroglancer');

  // Only offer the URL choice when the deployment overrides the Neuroglancer URL
  // (i.e. the configured template differs from the manifest default). Otherwise
  // both options resolve to the same URL and the control is meaningless.
  const hosts =
    neuroglancer?.manifestTemplateUrl &&
    neuroglancer.manifestTemplateUrl !== neuroglancer.urlTemplate
      ? {
          internal: hostLabel(neuroglancer.urlTemplate),
          public: hostLabel(neuroglancer.manifestTemplateUrl)
        }
      : null;

  const report = (result: Result<void>, ok: string) => {
    if (result.success) {
      toast.success(ok);
    } else {
      toast.error(result.error);
    }
  };

  const handleButtonTargetChange = async (target: NeuroglancerButtonTarget) =>
    report(
      await setNeuroglancerButtonTarget(target),
      'Neuroglancer button preference updated'
    );

  const multichannelSwitch = (
    <FgSwitch
      checked={useLegacyMultichannelApproach ?? false}
      // Without generated state there are no channel layers to shape.
      disabled={disableNeuroglancerStateGeneration}
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
  );

  return (
    <div className="space-y-6">
      <FgFieldSet legend="The Neuroglancer button on Zarr/OME-Zarr metadata panels opens the dataset in:">
        <FgRadio
          checked={neuroglancerButtonTarget === 'views'}
          color="primary"
          id="neuroglancer_button_target_views"
          label="Views (recommended)"
          name="neuroglancer_button_target"
          onChange={() => handleButtonTargetChange('views')}
          value="views"
        />
        <FgRadio
          checked={neuroglancerButtonTarget === 'standalone'}
          color="primary"
          id="neuroglancer_button_target_standalone"
          label="Standalone Neuroglancer"
          name="neuroglancer_button_target"
          onChange={() => handleButtonTargetChange('standalone')}
          value="standalone"
        />
      </FgFieldSet>

      <FgFieldSet legend="State generation options">
        <FgSwitch
          checked={!disableNeuroglancerStateGeneration}
          id="disable_neuroglancer_state_generation"
          label="Generate Neuroglancer state"
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
        {disableNeuroglancerStateGeneration ? (
          <FgTooltip
            label={`Your saved setting is ${useLegacyMultichannelApproach ? 'On' : 'Off'}. It does not apply while "Generate Neuroglancer state" is off.`}
          >
            {multichannelSwitch}
          </FgTooltip>
        ) : (
          multichannelSwitch
        )}
        <FgSwitch
          checked={!disableHeuristicalLayerTypeDetection}
          id="disable_heuristical_layer_type_detection"
          label="Use heuristic to identify segmentation layers"
          onChange={async () => {
            const result = await toggleDisableHeuristicalLayerTypeDetection();
            if (result.success) {
              toast.success(
                disableHeuristicalLayerTypeDetection
                  ? 'Segmentation layer heuristic is now enabled'
                  : 'Segmentation layer heuristic is now disabled'
              );
            } else {
              toast.error(result.error);
            }
          }}
          showState
        />
      </FgFieldSet>

      {hosts ? (
        <div className="space-y-4">
          <SubHeading>Views</SubHeading>
          <BaseUrlChoice
            hosts={hosts}
            idPrefix="views_neuroglancer_url"
            legend='"Open in Neuroglancer" base URL'
            onChange={async source =>
              report(
                await setViewsNeuroglancerUrlSource(source),
                'Views Neuroglancer URL preference updated'
              )
            }
            source={viewsNeuroglancerUrlSource}
          />
        </div>
      ) : null}

      {hosts ? (
        <div className="space-y-4">
          <SubHeading>Standalone Neuroglancer</SubHeading>
          <Typography className="text-sm text-foreground">
            Used when the Neuroglancer button opens a standalone Neuroglancer,
            and as the default for new Neuroglancer links.
          </Typography>
          <BaseUrlChoice
            hosts={hosts}
            idPrefix="neuroglancer_url_source"
            legend="Base URL"
            onChange={async source =>
              report(
                await setViewerUrlSource('neuroglancer', source),
                'Neuroglancer URL preference updated'
              )
            }
            source={viewerUrlSources['neuroglancer']}
          />
        </div>
      ) : null}
    </div>
  );
}
