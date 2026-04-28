import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HiHome } from 'react-icons/hi';

import FgIcon from '@/components/designSystem/atoms/FgIcon';

describe('FgIcon', () => {
  it('renders with default size (md) and has icon-default class', () => {
    render(<FgIcon icon={HiHome} />);

    const svg = document.querySelector('svg');
    expect(svg).toHaveClass('icon-default');
  });

  it.each([
    ['xs', 'icon-xsmall'],
    ['sm', 'icon-small'],
    ['md', 'icon-default'],
    ['lg', 'icon-large']
  ] as const)('renders size="%s" with class "%s"', (size, expectedClass) => {
    render(<FgIcon icon={HiHome} size={size} />);

    const svg = document.querySelector('svg');
    expect(svg).toHaveClass(expectedClass);
  });

  it('applies custom className alongside size class', () => {
    render(<FgIcon icon={HiHome} className="text-red-500" />);

    const svg = document.querySelector('svg');
    expect(svg).toHaveClass('icon-default');
    expect(svg).toHaveClass('text-red-500');
  });

  it.each([
    ['primary', 'text-primary'],
    ['secondary', 'text-secondary'],
    ['error', 'text-error'],
    ['success', 'text-success'],
    ['warning', 'text-warning'],
    ['info', 'text-info']
  ] as const)('renders color="%s" with class "%s"', (color, expectedClass) => {
    render(<FgIcon icon={HiHome} color={color} />);

    const svg = document.querySelector('svg');
    expect(svg).toHaveClass(expectedClass);
    expect(svg).toHaveClass('icon-default');
  });

  it('does not add a color class when color is omitted', () => {
    render(<FgIcon icon={HiHome} />);

    const svg = document.querySelector('svg');
    expect(svg?.className).not.toMatch(/text-/);
  });

  it('sets aria-label and role="img" when label is provided', () => {
    render(<FgIcon icon={HiHome} label="Home" />);

    const wrapper = screen.getByRole('img', { name: 'Home' });
    expect(wrapper).toBeInTheDocument();
  });

  it('sets aria-hidden="true" when no label is provided', () => {
    render(<FgIcon icon={HiHome} />);

    const wrapper = document.querySelector('[aria-hidden="true"]');
    expect(wrapper).toBeInTheDocument();
  });

  it('renders correctly in dark mode', () => {
    document.documentElement.classList.add('dark');

    render(<FgIcon icon={HiHome} label="Home" />);

    expect(screen.getByRole('img', { name: 'Home' })).toBeInTheDocument();

    document.documentElement.classList.remove('dark');
  });
});
