import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import DataLinkTabs from '@/components/ui/Dialogs/dataLinkUsage/tabsContent/DataLinkTabs';

import type {
  DataLinkType,
  ZarrVersion
} from '@/components/ui/Dialogs/dataLinkUsage/DataLinkUsageDialog';

function renderTabs(dataType: DataLinkType, zarrVersion?: ZarrVersion) {
  return render(
    <DataLinkTabs
      dataLinkUrl="https://example.com/data-link"
      dataType={dataType}
      tooltipTriggerClasses=""
      zarrVersion={zarrVersion}
    />
  );
}

function getTabLabels() {
  return screen.getAllByRole('tab').map(tab => tab.textContent);
}

function expectAlphabetical(labels: (string | null)[]) {
  const sorted = [...labels].sort((a, b) =>
    (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base' })
  );
  expect(labels).toEqual(sorted);
}

describe('DataLinkTabs', () => {
  it('shows Java and Python tabs for a regular directory', () => {
    renderTabs('directory');
    const labels = getTabLabels();
    expect(labels).toEqual(['Java', 'Python']);
    expectAlphabetical(labels);
  });

  it('shows Java, N5 Viewer, Napari, Python, and VVDViewer tabs for OME-Zarr v0.4 (Zarr v2)', () => {
    renderTabs('ome-zarr', 2);
    const labels = getTabLabels();
    expect(labels).toEqual([
      'Java',
      'N5 Viewer',
      'Napari',
      'Python',
      'VVDViewer'
    ]);
    expectAlphabetical(labels);
  });

  it('shows Java, Napari, and Python tabs for OME-Zarr v0.5 (Zarr v3)', () => {
    renderTabs('ome-zarr', 3);
    const labels = getTabLabels();
    expect(labels).toEqual(['Java', 'Napari', 'Python']);
    expectAlphabetical(labels);
  });

  it('shows Java, N5 Viewer, and Python tabs for Zarr v2', () => {
    renderTabs('zarr', 2);
    const labels = getTabLabels();
    expect(labels).toEqual(['Java', 'N5 Viewer', 'Python']);
    expectAlphabetical(labels);
  });

  it('shows Java and Python tabs for Zarr v3', () => {
    renderTabs('zarr', 3);
    const labels = getTabLabels();
    expect(labels).toEqual(['Java', 'Python']);
    expectAlphabetical(labels);
  });

  it('shows Java, N5 Viewer, and Python tabs for N5', () => {
    renderTabs('n5');
    const labels = getTabLabels();
    expect(labels).toEqual(['Java', 'N5 Viewer', 'Python']);
    expectAlphabetical(labels);
  });
});
