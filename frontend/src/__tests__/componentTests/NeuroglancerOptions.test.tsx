import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import NeuroglancerOptions from '@/components/ui/PreferencesPage/NeuroglancerOptions';

const prefs = vi.hoisted(() => ({
  disableNeuroglancerStateGeneration: false,
  disableHeuristicalLayerTypeDetection: false,
  useLegacyMultichannelApproach: true,
  viewerUrlSources: {},
  neuroglancerButtonTarget: 'views'
}));

vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => prefs
}));
vi.mock('@/contexts/ViewersContext', () => ({
  useViewersContext: () => ({ validViewers: [] })
}));

const generate = () => screen.getByLabelText('Generate Neuroglancer state');
const multichannel = () =>
  screen.getByLabelText('Generate multichannel state for Neuroglancer');
const heuristic = () =>
  screen.getByLabelText('Use heuristic to identify segmentation layers');

describe('NeuroglancerOptions state generation switches', () => {
  it('shows the stored "disable" preferences as positive switches', () => {
    prefs.disableNeuroglancerStateGeneration = false;
    render(<NeuroglancerOptions />);
    expect(generate()).toBeChecked();
    expect(heuristic()).toBeChecked();
    expect(multichannel()).toBeEnabled();
    expect(screen.queryByLabelText(/saved setting/)).toBeNull();
  });

  it('locks only the multichannel switch when generation is off', () => {
    prefs.disableNeuroglancerStateGeneration = true;
    render(<NeuroglancerOptions />);
    expect(generate()).not.toBeChecked();
    expect(multichannel()).toBeDisabled();
    // The stored choice survives for when generation comes back on.
    expect(multichannel()).toBeChecked();
    expect(heuristic()).toBeEnabled();
    expect(screen.getByLabelText(/saved setting is On/)).toBeInTheDocument();
  });
});
