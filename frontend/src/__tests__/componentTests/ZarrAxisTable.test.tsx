import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ZarrAxisTable from '@/components/ui/BrowsePage/ZarrAxisTable';
import type { Metadata } from '@/omezarr-helper';

describe('ZarrAxisTable', () => {
  it('shows axis units exactly as stored on disk', () => {
    const metadata = {
      zarrVersion: 3,
      shapes: [[24, 112]],
      scales: [[15, 1000]],
      arr: { chunks: [1, 144] },
      multiscales: [
        {
          axes: [
            { name: 't', type: 'time', unit: 'minute' },
            { name: 'z', type: 'space', unit: 'nanometer' }
          ],
          datasets: [
            {
              path: '0',
              coordinateTransformations: [{ type: 'scale', scale: [15, 1000] }]
            }
          ]
        }
      ]
    } as unknown as Metadata;

    render(<ZarrAxisTable metadata={metadata} />);

    expect(screen.getByText('minute')).toBeInTheDocument();
    expect(screen.getByText('nanometer')).toBeInTheDocument();
    expect(screen.queryByText('nm')).not.toBeInTheDocument();
  });
});
