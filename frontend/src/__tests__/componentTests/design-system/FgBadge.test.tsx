import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import FgBadge from '@/components/designSystem/atoms/FgBadge';

describe('FgBadge', () => {
  it('renders children text', () => {
    render(<FgBadge>Hello</FgBadge>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it.each([
    ['primary', 'bg-primary/20', 'text-primary'],
    ['secondary', 'bg-secondary/20', 'text-secondary'],
    ['success', 'bg-success/20', 'text-success'],
    ['error', 'bg-error/20', 'text-error'],
    ['warning', 'bg-warning/20', 'text-warning'],
    ['info', 'bg-info/20', 'text-info'],
    ['neutral', 'bg-surface', 'text-foreground']
  ] as const)(
    'applies correct classes for color="%s"',
    (color, expectedBg, expectedText) => {
      render(<FgBadge color={color}>Badge</FgBadge>);
      const badge = screen.getByText('Badge');
      expect(badge.className).toContain(expectedBg);
      expect(badge.className).toContain(expectedText);
    }
  );

  it('applies rounded-md for variant="default"', () => {
    render(<FgBadge variant="default">Badge</FgBadge>);
    const badge = screen.getByText('Badge');
    expect(badge.className).toContain('rounded-md');
    expect(badge.className).toContain('font-bold');
  });

  it('applies rounded-full for variant="pill"', () => {
    render(<FgBadge variant="pill">Badge</FgBadge>);
    const badge = screen.getByText('Badge');
    expect(badge.className).toContain('rounded-full');
    expect(badge.className).toContain('font-medium');
  });

  it('renders animated ping dot when dot is true', () => {
    const { container } = render(
      <FgBadge dot color="info">
        Running
      </FgBadge>
    );
    const dotWrapper = container.querySelector('.relative.flex.h-2.w-2');
    expect(dotWrapper).toBeInTheDocument();

    const pingSpan = container.querySelector('.animate-ping');
    expect(pingSpan).toBeInTheDocument();
    expect(pingSpan?.className).toContain('bg-info');
  });

  it('does not render dot when dot is false', () => {
    const { container } = render(<FgBadge>No dot</FgBadge>);
    const pingSpan = container.querySelector('.animate-ping');
    expect(pingSpan).not.toBeInTheDocument();
  });

  it('uses custom dotColor when provided', () => {
    const { container } = render(
      <FgBadge dot dotColor="bg-red-500">
        Custom
      </FgBadge>
    );
    const pingSpan = container.querySelector('.animate-ping');
    expect(pingSpan).toBeInTheDocument();
    expect(pingSpan?.className).toContain('bg-red-500');
  });

  it('applies custom className', () => {
    render(<FgBadge className="my-custom-class">Styled</FgBadge>);
    const badge = screen.getByText('Styled');
    expect(badge.className).toContain('my-custom-class');
  });

  it('defaults to size="sm" with text-xs class', () => {
    render(<FgBadge>Small</FgBadge>);
    const badge = screen.getByText('Small');
    expect(badge.className).toContain('text-xs');
  });

  it('applies text-sm class for size="md"', () => {
    render(<FgBadge size="md">Medium</FgBadge>);
    const badge = screen.getByText('Medium');
    expect(badge.className).toContain('text-sm');
  });

  it('renders correctly in dark mode', () => {
    document.documentElement.classList.add('dark');

    render(
      <FgBadge color="primary" dot>
        Dark badge
      </FgBadge>
    );

    expect(screen.getByText('Dark badge')).toBeInTheDocument();

    document.documentElement.classList.remove('dark');
  });
});
