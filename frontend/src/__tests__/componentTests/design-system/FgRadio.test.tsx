import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FgRadio from '@/components/designSystem/atoms/formElements/FgRadio';

describe('FgRadio', () => {
  it('renders a radio button', () => {
    render(<FgRadio label="Option A" id="option-a" />);
    expect(screen.getByRole('radio')).toBeInTheDocument();
  });

  it('always has type="radio"', () => {
    render(<FgRadio label="Option A" id="option-a" />);
    expect(screen.getByRole('radio')).toHaveAttribute('type', 'radio');
  });

  it('calls onChange when clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<FgRadio label="Option A" id="option-a" onChange={handleChange} />);
    await user.click(screen.getByRole('radio'));

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('renders disabled state', () => {
    render(<FgRadio label="Option A" id="option-a" disabled />);
    expect(screen.getByRole('radio')).toBeDisabled();
  });

  it('default color is secondary with accent-secondary-light class', () => {
    render(<FgRadio label="Option A" id="option-a" />);
    expect(screen.getByRole('radio').className).toContain(
      'accent-secondary-light'
    );
  });

  it('primary color has accent-primary class', () => {
    render(<FgRadio label="Option A" id="option-a" color="primary" />);
    expect(screen.getByRole('radio').className).toContain('accent-primary');
  });

  it('renders label text', () => {
    render(<FgRadio label="Option A" id="option-a" />);
    expect(screen.getByText('Option A')).toBeInTheDocument();
  });

  it('label uses htmlFor matching the id prop', () => {
    const { container } = render(<FgRadio label="Option A" id="option-a" />);
    const labelEl = container.querySelector('label');
    expect(labelEl).toHaveAttribute('for', 'option-a');
  });

  it('label has cursor-pointer class', () => {
    const { container } = render(<FgRadio label="Option A" id="option-a" />);
    const labelEl = container.querySelector('label');
    expect(labelEl?.className).toContain('cursor-pointer');
  });

  it('label has cursor-default when disabled', () => {
    const { container } = render(
      <FgRadio label="Option A" id="option-a" disabled />
    );
    const labelEl = container.querySelector('label');
    expect(labelEl?.className).toContain('cursor-default');
  });

  it('hideLabel hides visible label and sets aria-label', () => {
    const { container } = render(
      <FgRadio label="Option A" id="option-a" hideLabel />
    );
    const labelEl = container.querySelector('label');
    expect(labelEl).not.toBeInTheDocument();
    expect(screen.getByRole('radio')).toHaveAttribute('aria-label', 'Option A');
  });

  it('does not set aria-label when label is visible', () => {
    render(<FgRadio label="Option A" id="option-a" />);
    expect(screen.getByRole('radio')).not.toHaveAttribute('aria-label');
  });

  it('has icon-small class', () => {
    render(<FgRadio label="Option A" id="option-a" />);
    expect(screen.getByRole('radio').className).toContain('icon-small');
  });

  it('has focus-visible outline classes', () => {
    render(<FgRadio label="Option A" id="option-a" />);
    const radio = screen.getByRole('radio');
    expect(radio.className).toContain('focus-visible:outline');
    expect(radio.className).toContain('focus-visible:outline-primary');
  });

  it('applies custom className', () => {
    render(
      <FgRadio label="Option A" id="option-a" className="my-custom-class" />
    );
    expect(screen.getByRole('radio').className).toContain('my-custom-class');
  });

  it('renders correctly in dark mode', () => {
    document.documentElement.classList.add('dark');

    render(<FgRadio label="Dark radio" id="dark-radio" />);
    expect(screen.getByText('Dark radio')).toBeInTheDocument();
    expect(screen.getByRole('radio')).toBeInTheDocument();

    document.documentElement.classList.remove('dark');
  });
});
