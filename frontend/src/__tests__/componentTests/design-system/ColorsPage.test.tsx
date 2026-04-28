import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import ColorsPage from '@/components/designSystem/previewRoutes/ColorsPage';

describe('ColorsPage', () => {
  it('renders the page heading', () => {
    render(<ColorsPage />);

    expect(
      screen.getByRole('heading', { name: /design system colors/i })
    ).toBeInTheDocument();
  });

  it('renders light and dark mode sections', () => {
    render(<ColorsPage />);

    expect(
      screen.getByRole('heading', { name: 'Light Mode' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Dark Mode' })
    ).toBeInTheDocument();
  });

  it('renders all color group names in both modes', () => {
    render(<ColorsPage />);

    const expectedGroups = [
      'primary',
      'secondary',
      'surface',
      'success',
      'info',
      'warning',
      'error'
    ];

    for (const group of expectedGroups) {
      const matches = screen.getAllByText(group);
      // Each group appears in both light and dark mode sections
      expect(matches.length).toBe(2);
    }
  });

  it('renders color swatches with hex values', () => {
    render(<ColorsPage />);

    // Spot-check a unique hex value from light mode
    expect(screen.getByText('#058d96')).toBeInTheDocument();

    // #FFFFFF appears multiple times (foreground values across groups)
    expect(screen.getAllByText('#FFFFFF').length).toBeGreaterThanOrEqual(1);

    // Spot-check a dark mode hex value
    expect(screen.getByText('#111827')).toBeInTheDocument();
  });

  it('renders variant labels for each color group', () => {
    render(<ColorsPage />);

    // Each group has 4 variant swatches; check labels exist
    const defaultLabels = screen.getAllByText('default');
    expect(defaultLabels.length).toBeGreaterThanOrEqual(14); // 7 groups x 2 modes

    const darkLabels = screen.getAllByText('dark');
    expect(darkLabels.length).toBeGreaterThanOrEqual(14);
  });
});
