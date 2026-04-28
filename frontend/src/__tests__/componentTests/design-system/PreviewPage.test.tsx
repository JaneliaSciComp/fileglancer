import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import PreviewPage from '@/components/designSystem/previewRoutes/PreviewPage';

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('PreviewPage', () => {
  it('renders the page heading', () => {
    renderWithRouter(<PreviewPage />);

    expect(
      screen.getByRole('heading', { name: /design system preview/i })
    ).toBeInTheDocument();
  });

  it('renders all atom component sections', () => {
    renderWithRouter(<PreviewPage />);

    expect(screen.getByText('FgIcon')).toBeInTheDocument();
    expect(screen.getByText('FgButton')).toBeInTheDocument();
    expect(screen.getByText('FgBadge')).toBeInTheDocument();
    expect(screen.getByText('FgLink')).toBeInTheDocument();
    expect(screen.getByText('FgExternalLink')).toBeInTheDocument();
  });

  it('renders empty category placeholders', () => {
    renderWithRouter(<PreviewPage />);

    expect(
      screen.getByRole('heading', { name: 'Molecules' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Organisms' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Templates' })
    ).toBeInTheDocument();
  });

  it('renders the colors reference link', () => {
    renderWithRouter(<PreviewPage />);

    const colorsLink = screen.getByRole('link', {
      name: /view colors reference/i
    });
    expect(colorsLink).toHaveAttribute('href', '/design-system/colors');
  });

  it('toggles dark mode class on document element', async () => {
    const user = userEvent.setup();
    document.documentElement.classList.remove('dark');

    renderWithRouter(<PreviewPage />);

    const toggleBtn = screen.getByRole('button', { name: /dark mode/i });
    await user.click(toggleBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    const lightBtn = screen.getByRole('button', { name: /light mode/i });
    await user.click(lightBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
