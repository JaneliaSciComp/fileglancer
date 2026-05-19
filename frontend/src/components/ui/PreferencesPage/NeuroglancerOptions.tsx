import toast from 'react-hot-toast';

import FgSwitch from '@/components/designSystem/atoms/formElements/FgSwitch';
import FgFieldSet from '@/components/designSystem/molecules/FgFieldSet';
import { usePreferencesContext } from '@/contexts/PreferencesContext';

export default function NeuroglancerOptions() {
  const {
    useLegacyMultichannelApproach,
    toggleUseLegacyMultichannelApproach,
    disableNeuroglancerStateGeneration,
    toggleDisableNeuroglancerStateGeneration,
    disableHeuristicalLayerTypeDetection,
    toggleDisableHeuristicalLayerTypeDetection
  } = usePreferencesContext();

  return (
    <FgFieldSet legend="Neuroglancer">
      <FgSwitch
        checked={useLegacyMultichannelApproach ?? false}
        id="use_legacy_multichannel_approach"
        label="Generate multichannel state for Neuroglancer"
        showState
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
      />
      <FgSwitch
        checked={disableNeuroglancerStateGeneration}
        id="disable_neuroglancer_state_generation"
        label="Disable Neuroglancer state generation"
        showState
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
  );
}
