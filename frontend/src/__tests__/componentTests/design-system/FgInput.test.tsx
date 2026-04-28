import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FgInput from '@/components/designSystem/atoms/formElements/FgInput';

describe('FgInput', () => {
  it('renders with placeholder text', () => {
    render(<FgInput placeholder="Enter text" />);

    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('calls onChange when typed into', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<FgInput placeholder="Type here" onChange={handleChange} />);

    await user.type(screen.getByPlaceholderText('Type here'), 'hello');
    expect(handleChange).toHaveBeenCalled();
  });

  it('renders disabled state', () => {
    render(<FgInput placeholder="Disabled" disabled />);

    const input = screen.getByPlaceholderText('Disabled');
    expect(input).toBeDisabled();
    expect(input).toHaveClass('disabled:cursor-not-allowed');
  });

  it('error state adds border-error class and removes border-primary-light', () => {
    render(<FgInput placeholder="Error" error />);

    const input = screen.getByPlaceholderText('Error');
    expect(input.className).toContain('border-error');
    expect(input.className).not.toContain('border-primary-light');
  });

  it('default size is md with text-base class', () => {
    render(<FgInput placeholder="Default" />);

    const input = screen.getByPlaceholderText('Default');
    expect(input.className).toContain('text-base');
    expect(input.className).toContain('p-2');
  });

  it('size lg applies text-lg class', () => {
    render(<FgInput placeholder="Large" size="lg" />);

    const input = screen.getByPlaceholderText('Large');
    expect(input.className).toContain('text-lg');
  });

  it('has focus-visible outline classes', () => {
    render(<FgInput placeholder="Focus" />);

    const input = screen.getByPlaceholderText('Focus');
    expect(input).toHaveClass('focus-visible:outline');
    expect(input).toHaveClass('focus-visible:outline-2');
    expect(input).toHaveClass('focus-visible:outline-offset-1');
    expect(input).toHaveClass('focus-visible:outline-primary');
  });

  it('applies custom className', () => {
    render(<FgInput placeholder="Custom" className="my-custom-class" />);

    const input = screen.getByPlaceholderText('Custom');
    expect(input.className).toContain('my-custom-class');
  });

  it('renders in dark mode', () => {
    document.documentElement.classList.add('dark');

    render(<FgInput placeholder="Dark mode" />);

    expect(screen.getByPlaceholderText('Dark mode')).toBeInTheDocument();

    document.documentElement.classList.remove('dark');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLInputElement>();

    render(<FgInput ref={ref} placeholder="Ref test" />);

    expect(ref.current).toBe(screen.getByPlaceholderText('Ref test'));
  });
});
