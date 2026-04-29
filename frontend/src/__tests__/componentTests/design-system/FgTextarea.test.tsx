import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FgTextarea from '@/components/designSystem/atoms/formElements/FgTextarea';

describe('FgTextarea', () => {
  it('renders with placeholder text', () => {
    render(<FgTextarea placeholder="Enter text" />);

    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('calls onChange when typed into', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<FgTextarea placeholder="Type here" onChange={handleChange} />);

    await user.type(screen.getByPlaceholderText('Type here'), 'hello');
    expect(handleChange).toHaveBeenCalled();
  });

  it('renders disabled state', () => {
    render(<FgTextarea placeholder="Disabled" disabled />);

    const textarea = screen.getByPlaceholderText('Disabled');
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveClass('disabled:cursor-not-allowed');
  });

  it('error state adds border-error class', () => {
    render(<FgTextarea placeholder="Error" error />);

    const textarea = screen.getByPlaceholderText('Error');
    expect(textarea.className).toContain('border-error');
    expect(textarea.className).not.toContain('border-primary-light');
  });

  it('passes through rows prop', () => {
    render(<FgTextarea placeholder="Rows" rows={5} />);

    const textarea = screen.getByPlaceholderText('Rows');
    expect(textarea).toHaveAttribute('rows', '5');
  });

  it('has focus-visible outline classes', () => {
    render(<FgTextarea placeholder="Focus" />);

    const textarea = screen.getByPlaceholderText('Focus');
    expect(textarea).toHaveClass('focus-visible:outline');
    expect(textarea).toHaveClass('focus-visible:outline-2');
    expect(textarea).toHaveClass('focus-visible:outline-offset-1');
    expect(textarea).toHaveClass('focus-visible:outline-primary');
  });

  it('applies custom className', () => {
    render(<FgTextarea placeholder="Custom" className="my-custom-class" />);

    const textarea = screen.getByPlaceholderText('Custom');
    expect(textarea.className).toContain('my-custom-class');
  });

  it('renders in dark mode', () => {
    document.documentElement.classList.add('dark');

    render(<FgTextarea placeholder="Dark mode" />);

    expect(screen.getByPlaceholderText('Dark mode')).toBeInTheDocument();

    document.documentElement.classList.remove('dark');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLTextAreaElement>();

    render(<FgTextarea ref={ref} placeholder="Ref test" />);

    expect(ref.current).toBe(screen.getByPlaceholderText('Ref test'));
  });
});
