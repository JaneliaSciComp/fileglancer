import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FgSelect from '@/components/designSystem/atoms/formElements/FgSelect';

describe('FgSelect', () => {
  it('renders with option children', () => {
    render(
      <FgSelect>
        <option value="a">Option A</option>
        <option value="b">Option B</option>
      </FgSelect>
    );

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('calls onChange when option selected', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <FgSelect onChange={handleChange}>
        <option value="a">Option A</option>
        <option value="b">Option B</option>
      </FgSelect>
    );

    await user.selectOptions(screen.getByRole('combobox'), 'b');
    expect(handleChange).toHaveBeenCalled();
  });

  it('renders disabled state', () => {
    render(
      <FgSelect disabled>
        <option value="a">Option A</option>
      </FgSelect>
    );

    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
    expect(select).toHaveClass('disabled:cursor-not-allowed');
  });

  it('error state adds border-error class', () => {
    render(
      <FgSelect error>
        <option value="a">Option A</option>
      </FgSelect>
    );

    const select = screen.getByRole('combobox');
    expect(select.className).toContain('border-error');
    expect(select.className).not.toContain('border-primary-light');
  });

  it('has focus-visible outline classes', () => {
    render(
      <FgSelect>
        <option value="a">Option A</option>
      </FgSelect>
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveClass('focus-visible:outline');
    expect(select).toHaveClass('focus-visible:outline-2');
    expect(select).toHaveClass('focus-visible:outline-offset-1');
    expect(select).toHaveClass('focus-visible:outline-primary');
  });

  it('applies custom className', () => {
    render(
      <FgSelect className="my-custom-class">
        <option value="a">Option A</option>
      </FgSelect>
    );

    const select = screen.getByRole('combobox');
    expect(select.className).toContain('my-custom-class');
  });

  it('renders in dark mode', () => {
    document.documentElement.classList.add('dark');

    render(
      <FgSelect>
        <option value="a">Option A</option>
      </FgSelect>
    );

    expect(screen.getByRole('combobox')).toBeInTheDocument();

    document.documentElement.classList.remove('dark');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLSelectElement>();

    render(
      <FgSelect ref={ref}>
        <option value="a">Option A</option>
      </FgSelect>
    );

    expect(ref.current).toBe(screen.getByRole('combobox'));
  });
});
