import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FgSwitch from '@/components/designSystem/atoms/formElements/FgSwitch';

describe('FgSwitch', () => {
  it('renders a switch element', () => {
    render(
      <FgSwitch label="Toggle" id="toggle" checked={false} onChange={vi.fn()} />
    );
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('calls onChange when clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <FgSwitch
        label="Toggle"
        id="toggle"
        checked={false}
        onChange={handleChange}
      />
    );
    await user.click(screen.getByRole('checkbox'));

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('renders visible label text', () => {
    render(
      <FgSwitch
        label="Toggle me"
        id="toggle"
        checked={false}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Toggle me')).toBeInTheDocument();
  });

  it('label is associated with switch via htmlFor', () => {
    const { container } = render(
      <FgSwitch
        label="Toggle me"
        id="toggle"
        checked={false}
        onChange={vi.fn()}
      />
    );
    const labelEl = container.querySelector('label');
    expect(labelEl).toHaveAttribute('for', 'toggle');
  });

  it('label has cursor-pointer class', () => {
    const { container } = render(
      <FgSwitch
        label="Toggle me"
        id="toggle"
        checked={false}
        onChange={vi.fn()}
      />
    );
    const labelEl = container.querySelector('label');
    expect(labelEl?.className).toContain('cursor-pointer');
  });

  it('label has cursor-default when disabled', () => {
    const { container } = render(
      <FgSwitch
        label="Toggle me"
        id="toggle"
        checked={false}
        onChange={vi.fn()}
        disabled
      />
    );
    const labelEl = container.querySelector('label');
    expect(labelEl?.className).toContain('cursor-default');
  });

  it('label is not bold', () => {
    const { container } = render(
      <FgSwitch
        label="Toggle me"
        id="toggle"
        checked={false}
        onChange={vi.fn()}
      />
    );
    const labelEl = container.querySelector('label');
    expect(labelEl?.className).not.toContain('font-semibold');
    expect(labelEl?.className).not.toContain('font-bold');
  });

  it('showState displays "On" when checked', () => {
    render(
      <FgSwitch
        label="Feature"
        id="feature"
        checked={true}
        onChange={vi.fn()}
        showState
      />
    );
    const stateTexts = screen.getAllByText('On');
    expect(stateTexts.length).toBeGreaterThan(0);
  });

  it('showState displays "Off" when unchecked', () => {
    render(
      <FgSwitch
        label="Feature"
        id="feature"
        checked={false}
        onChange={vi.fn()}
        showState
      />
    );
    const stateTexts = screen.getAllByText('Off');
    expect(stateTexts.length).toBeGreaterThan(0);
  });

  it('state text is bold', () => {
    const { container } = render(
      <FgSwitch
        label="Feature"
        id="feature"
        checked={true}
        onChange={vi.fn()}
        showState
      />
    );
    const stateSpans = container.querySelectorAll('span');
    const boldSpans = Array.from(stateSpans).filter(
      span =>
        span.textContent === 'On' && span.className.includes('font-semibold')
    );
    expect(boldSpans.length).toBeGreaterThan(0);
  });

  it('does not show state text by default', () => {
    render(
      <FgSwitch
        label="Feature"
        id="feature"
        checked={true}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByText('On')).not.toBeInTheDocument();
    expect(screen.queryByText('Off')).not.toBeInTheDocument();
  });

  it('has focus-visible classes on the switch', () => {
    const { container } = render(
      <FgSwitch label="Toggle" id="toggle" checked={false} onChange={vi.fn()} />
    );
    const focusEl = container.querySelector('[class*="focus-visible:outline"]');
    expect(focusEl).toBeInTheDocument();
  });

  it('renders correctly in dark mode', () => {
    document.documentElement.classList.add('dark');

    render(
      <FgSwitch
        label="Dark switch"
        id="dark-switch"
        checked={true}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Dark switch')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();

    document.documentElement.classList.remove('dark');
  });
});
