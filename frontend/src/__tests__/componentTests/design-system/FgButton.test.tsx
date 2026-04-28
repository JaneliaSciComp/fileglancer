import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HiHome } from 'react-icons/hi';

import FgButton from '@/components/designSystem/atoms/FgButton';

describe('FgButton', () => {
  it('renders children text', () => {
    render(<FgButton>Click me</FgButton>);

    expect(
      screen.getByRole('button', { name: /click me/i })
    ).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<FgButton onClick={handleClick}>Click me</FgButton>);

    await user.click(screen.getByRole('button', { name: /click me/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClick when disabled', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <FgButton disabled onClick={handleClick}>
        Click me
      </FgButton>
    );

    await user.click(screen.getByRole('button', { name: /click me/i }));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('does NOT call onClick when loading', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <FgButton loading loadingText="Please wait..." onClick={handleClick}>
        Click me
      </FgButton>
    );

    const button = screen.getByRole('button');
    await user.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('shows spinner and loadingText when loading', () => {
    render(
      <FgButton loading loadingText="Saving...">
        Save
      </FgButton>
    );

    expect(screen.getByTitle('Loading spinner')).toBeInTheDocument();
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('renders leading icon when icon prop is provided', () => {
    render(<FgButton icon={HiHome}>Home</FgButton>);

    const button = screen.getByRole('button', { name: /home/i });
    const iconWrapper = button.querySelector('span[aria-hidden="true"]');
    expect(iconWrapper).toBeInTheDocument();
  });

  it('has focus-visible outline classes', () => {
    render(<FgButton>Focus me</FgButton>);

    const button = screen.getByRole('button', { name: /focus me/i });
    expect(button).toHaveClass('focus-visible:outline');
    expect(button).toHaveClass('focus-visible:outline-2');
    expect(button).toHaveClass('focus-visible:outline-offset-2');
    expect(button).toHaveClass('focus-visible:outline-primary');
  });

  it('renders as a link when href is provided', () => {
    render(
      <FgButton href="https://example.com" target="_blank" rel="noopener">
        Open
      </FgButton>
    );

    const link = screen.getByRole('link', { name: /open/i });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
  });

  it('strips href and marks aria-disabled when disabled with href', () => {
    const { container } = render(
      <FgButton disabled href="https://example.com">
        Open
      </FgButton>
    );

    const anchor = container.querySelector('a')!;
    expect(anchor).not.toHaveAttribute('href');
    expect(anchor).toHaveAttribute('aria-disabled', 'true');
    expect(anchor).toHaveClass('pointer-events-none');
    expect(anchor).toHaveClass('opacity-50');
  });

  it('strips href and marks aria-disabled when loading with href', () => {
    const { container } = render(
      <FgButton href="https://example.com" loading loadingText="Loading...">
        Open
      </FgButton>
    );

    const anchor = container.querySelector('a')!;
    expect(anchor).not.toHaveAttribute('href');
    expect(anchor).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('passes onClick to the href variant', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <FgButton href="https://example.com" onClick={handleClick}>
        Open
      </FgButton>
    );

    await user.click(screen.getByRole('link', { name: /open/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders correctly in dark mode', () => {
    document.documentElement.classList.add('dark');

    render(<FgButton>Dark mode</FgButton>);

    expect(
      screen.getByRole('button', { name: /dark mode/i })
    ).toBeInTheDocument();

    document.documentElement.classList.remove('dark');
  });
});
