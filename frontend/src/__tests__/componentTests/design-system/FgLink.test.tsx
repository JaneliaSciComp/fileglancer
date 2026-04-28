import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import FgLink from '@/components/designSystem/atoms/FgLink';

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('FgLink', () => {
  it('renders as a link with correct to', () => {
    renderWithRouter(<FgLink to="/browse">Browse</FgLink>);

    const link = screen.getByRole('link', { name: 'Browse' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/browse');
  });

  it('applies default size class (text-base)', () => {
    renderWithRouter(<FgLink to="/test">Test</FgLink>);

    const link = screen.getByRole('link', { name: 'Test' });
    expect(link.className).toContain('text-base');
  });

  it.each([
    ['sm', 'text-sm'],
    ['md', 'text-base'],
    ['lg', 'text-lg']
  ] as const)('applies size="%s" with class "%s"', (size, expectedClass) => {
    renderWithRouter(
      <FgLink size={size} to="/test">
        Test
      </FgLink>
    );

    const link = screen.getByRole('link', { name: 'Test' });
    expect(link.className).toContain(expectedClass);
  });

  it('has focus-visible styles in className', () => {
    renderWithRouter(<FgLink to="/test">Test</FgLink>);

    const link = screen.getByRole('link', { name: 'Test' });
    expect(link.className).toContain('focus-visible:underline');
    expect(link.className).toContain('focus-visible:outline');
  });

  it('calls onClick handler', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    renderWithRouter(
      <FgLink onClick={handleClick} to="/test">
        Click me
      </FgLink>
    );

    await user.click(screen.getByRole('link', { name: 'Click me' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies custom className', () => {
    renderWithRouter(
      <FgLink className="my-custom-class" to="/test">
        Test
      </FgLink>
    );

    const link = screen.getByRole('link', { name: 'Test' });
    expect(link.className).toContain('my-custom-class');
  });

  it('renders correctly in dark mode', () => {
    document.documentElement.classList.add('dark');

    renderWithRouter(<FgLink to="/test">Dark link</FgLink>);

    expect(screen.getByRole('link', { name: 'Dark link' })).toBeInTheDocument();

    document.documentElement.classList.remove('dark');
  });
});
