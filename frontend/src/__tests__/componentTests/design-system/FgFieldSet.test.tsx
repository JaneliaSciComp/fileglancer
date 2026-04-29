import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import FgFieldSet from '@/components/designSystem/molecules/FgFieldSet';

describe('FgFieldSet', () => {
  it('renders a fieldset element', () => {
    const { container } = render(
      <FgFieldSet legend="Options">
        <span>Child content</span>
      </FgFieldSet>
    );

    expect(container.querySelector('fieldset')).toBeInTheDocument();
  });

  it('renders legend text', () => {
    render(
      <FgFieldSet legend="File path format">
        <span>Child</span>
      </FgFieldSet>
    );

    expect(screen.getByText('File path format')).toBeInTheDocument();
    expect(screen.getByText('File path format').tagName).toBe('LEGEND');
  });

  it('renders children', () => {
    render(
      <FgFieldSet legend="Options">
        <span>Option A</span>
        <span>Option B</span>
      </FgFieldSet>
    );

    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('resets default fieldset border styles', () => {
    const { container } = render(
      <FgFieldSet legend="Options">
        <span>Child</span>
      </FgFieldSet>
    );

    const fieldset = container.querySelector('fieldset');
    expect(fieldset).toHaveClass('border-none', 'p-0', 'm-0');
  });

  it('applies label styling to legend', () => {
    render(
      <FgFieldSet legend="Options">
        <span>Child</span>
      </FgFieldSet>
    );

    const legend = screen.getByText('Options');
    expect(legend).toHaveClass('text-foreground', 'text-sm', 'font-semibold');
  });

  it('renders children directly when inline is false', () => {
    const { container } = render(
      <FgFieldSet legend="Options">
        <span>Option A</span>
        <span>Option B</span>
      </FgFieldSet>
    );

    const fieldset = container.querySelector('fieldset');
    // Children should be direct children of fieldset (after legend), not wrapped
    expect(fieldset?.querySelector('.flex.items-center.gap-4')).toBeNull();
  });

  it('wraps children in flex container when inline is true', () => {
    const { container } = render(
      <FgFieldSet inline legend="Input mode">
        <span>URL</span>
        <span>State</span>
      </FgFieldSet>
    );

    const flexWrapper = container.querySelector('.flex.items-center.gap-4');
    expect(flexWrapper).toBeInTheDocument();
    expect(flexWrapper).toHaveTextContent('URL');
    expect(flexWrapper).toHaveTextContent('State');
  });

  it('applies custom className to fieldset', () => {
    const { container } = render(
      <FgFieldSet className="mt-4" legend="Options">
        <span>Child</span>
      </FgFieldSet>
    );

    const fieldset = container.querySelector('fieldset');
    expect(fieldset).toHaveClass('mt-4');
  });

  it('handles empty className gracefully', () => {
    const { container } = render(
      <FgFieldSet legend="Options">
        <span>Child</span>
      </FgFieldSet>
    );

    const fieldset = container.querySelector('fieldset');
    expect(fieldset).toHaveClass('border-none');
    // Should not have trailing space or undefined in class list
    expect(fieldset?.className).not.toContain('undefined');
  });

  it('has correct displayName', () => {
    expect(FgFieldSet.displayName).toBe('FgFieldSet');
  });
});
