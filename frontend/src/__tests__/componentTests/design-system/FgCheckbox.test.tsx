import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FgCheckbox from '@/components/designSystem/atoms/formElements/FgCheckbox';

describe('FgCheckbox', () => {
  it('renders a checkbox', () => {
    render(<FgCheckbox label="Accept terms" />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('always has type="checkbox"', () => {
    render(<FgCheckbox label="Accept terms" />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('type', 'checkbox');
  });

  it('calls onChange when clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<FgCheckbox label="Accept terms" onChange={handleChange} />);
    await user.click(screen.getByRole('checkbox'));

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('renders disabled state', () => {
    render(<FgCheckbox disabled label="Accept terms" />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('default color is primary with accent-primary class', () => {
    render(<FgCheckbox label="Accept terms" />);
    expect(screen.getByRole('checkbox').className).toContain('accent-primary');
  });

  it('secondary color has accent-secondary-light class', () => {
    render(<FgCheckbox color="secondary" label="Accept terms" />);
    expect(screen.getByRole('checkbox').className).toContain(
      'accent-secondary-light'
    );
  });

  it('renders label text', () => {
    render(<FgCheckbox label="Accept terms" />);
    expect(screen.getByText('Accept terms')).toBeInTheDocument();
  });

  it('label wrapper has cursor-pointer class', () => {
    const { container } = render(<FgCheckbox label="Click me" />);
    const labelEl = container.querySelector('label');
    expect(labelEl?.className).toContain('cursor-pointer');
  });

  it('label wrapper has cursor-default when disabled', () => {
    const { container } = render(<FgCheckbox disabled label="Click me" />);
    const labelEl = container.querySelector('label');
    expect(labelEl?.className).toContain('cursor-default');
  });

  it('has focus-visible outline classes on the input', () => {
    render(<FgCheckbox label="Accept terms" />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.className).toContain('focus-visible:outline');
    expect(checkbox.className).toContain('focus-visible:outline-primary');
  });

  it('applies custom className to the input', () => {
    render(<FgCheckbox className="my-custom-class" label="Accept terms" />);
    expect(screen.getByRole('checkbox').className).toContain('my-custom-class');
  });

  it('renders correctly in dark mode', () => {
    document.documentElement.classList.add('dark');

    render(<FgCheckbox label="Dark checkbox" color="secondary" />);
    expect(screen.getByText('Dark checkbox')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();

    document.documentElement.classList.remove('dark');
  });

  it('hides label text when hideLabel is true', () => {
    render(<FgCheckbox hideLabel label="Hidden label" />);
    expect(screen.queryByText('Hidden label')).not.toBeInTheDocument();
  });

  it('sets aria-label when hideLabel is true', () => {
    render(<FgCheckbox hideLabel label="Hidden label" />);
    expect(screen.getByRole('checkbox')).toHaveAttribute(
      'aria-label',
      'Hidden label'
    );
  });

  it('does not set aria-label when hideLabel is false', () => {
    render(<FgCheckbox label="Visible label" />);
    expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-label');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLInputElement>();

    render(<FgCheckbox label="Accept terms" ref={ref} />);

    expect(ref.current).toBe(screen.getByRole('checkbox'));
  });
});
