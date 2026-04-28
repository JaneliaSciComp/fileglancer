import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import FgExternalLink from '@/components/designSystem/atoms/FgExternalLink';

describe('FgExternalLink', () => {
  it('renders as an anchor with target="_blank" and rel="noopener noreferrer"', () => {
    render(<FgExternalLink href="https://example.com">Example</FgExternalLink>);

    const link = screen.getByRole('link', { name: /Example/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  it('shows external icon by default', () => {
    render(<FgExternalLink href="https://example.com">Example</FgExternalLink>);

    const iconWrapper = document.querySelector('[aria-hidden="true"]');
    expect(iconWrapper).toBeInTheDocument();
  });

  it('hides icon when showIcon={false}', () => {
    render(
      <FgExternalLink href="https://example.com" showIcon={false}>
        Example
      </FgExternalLink>
    );

    const iconWrapper = document.querySelector('[aria-hidden="true"]');
    expect(iconWrapper).not.toBeInTheDocument();
  });

  it('has focus-visible styles', () => {
    render(<FgExternalLink href="https://example.com">Example</FgExternalLink>);

    const link = screen.getByRole('link', { name: /Example/ });
    expect(link.className).toContain('focus-visible:underline');
    expect(link.className).toContain('focus-visible:outline');
  });

  it('applies custom className', () => {
    render(
      <FgExternalLink className="my-custom-class" href="https://example.com">
        Example
      </FgExternalLink>
    );

    const link = screen.getByRole('link', { name: /Example/ });
    expect(link.className).toContain('my-custom-class');
  });

  it.each([
    ['sm', 'text-sm'],
    ['md', 'text-base'],
    ['lg', 'text-lg']
  ] as const)('applies size="%s" with class "%s"', (size, expectedClass) => {
    render(
      <FgExternalLink href="https://example.com" size={size}>
        Example
      </FgExternalLink>
    );

    const link = screen.getByRole('link', { name: /Example/ });
    expect(link.className).toContain(expectedClass);
  });

  it('renders correctly in dark mode', () => {
    document.documentElement.classList.add('dark');

    render(
      <FgExternalLink href="https://example.com">Dark link</FgExternalLink>
    );

    expect(screen.getByRole('link', { name: /Dark link/ })).toBeInTheDocument();

    document.documentElement.classList.remove('dark');
  });
});
