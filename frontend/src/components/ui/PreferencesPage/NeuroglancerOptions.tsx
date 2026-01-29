import toast from 'react-hot-toast';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import OptionsSection from '@/components/ui/PreferencesPage/OptionsSection';

export default function LegacyMultichannelToggle() {
  const {
    useLegacyMultichannelApproach,
    toggleUseLegacyMultichannelApproach,
    disableNeuroglancerStateGeneration,
    toggleDisableNeuroglancerStateGeneration,
    disableHeuristicalLayerTypeDetection,
    toggleDisableHeuristicalLayerTypeDetection
  } = usePreferencesContext();

  return (
    <OptionsSection
      header="Neuroglancer"
      options={[
        {
          checked: useLegacyMultichannelApproach ?? false,
          id: 'use_legacy_multichannel_approach',
          label: 'Generate multichannel state for Neuroglancer',
          onChange: async () => {
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
          }
        },
        {
          checked: disableNeuroglancerStateGeneration,
          id: 'disable_neuroglancer_state_generation',
          label: 'Disable Neuroglancer state generation',
          onChange: async () => {
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
          }
        },
        {
          checked: disableHeuristicalLayerTypeDetection ?? false,
          id: 'disable_heuristical_layer_type_detection',
          label: 'Disable heuristical layer type determination',
          onChange: async () => {
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
          }
        }
      ]}
    />
  );
}
