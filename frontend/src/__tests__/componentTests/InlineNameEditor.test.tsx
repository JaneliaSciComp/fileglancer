import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InlineNameEditor from '@/components/ui/widgets/InlineNameEditor';

// ponytail: FgTooltip.Trigger duplicates its aria-label onto a wrapping div
// (see FgTooltip.tsx), which breaks getByLabelText with two matches. Mirror
// the existing NavbarBadge.test.tsx pattern and strip the wrapper in tests.
vi.mock('@/components/ui/widgets/FgTooltip', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>
}));

describe('InlineNameEditor', () => {
  it('shows the name and saves an edited name on Enter', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineNameEditor label="view name" onSave={onSave} value="Old" />);
    expect(screen.getByText('Old')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Edit view name'));
    const input = screen.getByRole('textbox');
    expect(input).toHaveFocus();
    await userEvent.clear(input);
    await userEvent.type(input, 'New{Enter}');
    expect(onSave).toHaveBeenCalledWith('New');
    await waitFor(() =>
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    );
  });

  it('cancels on Escape without saving', async () => {
    const onSave = vi.fn();
    render(<InlineNameEditor label="view name" onSave={onSave} value="Old" />);
    await userEvent.click(screen.getByLabelText('Edit view name'));
    await userEvent.type(screen.getByRole('textbox'), 'x{Escape}');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Old')).toBeInTheDocument();
  });

  it('disables Cancel while a save is in flight', async () => {
    const onSave = vi.fn(() => new Promise<void>(() => {})); // never resolves
    render(<InlineNameEditor label="view name" onSave={onSave} value="Old" />);
    await userEvent.click(screen.getByLabelText('Edit view name'));
    await userEvent.click(screen.getByLabelText('Save view name'));
    expect(screen.getByLabelText('Cancel rename')).toBeDisabled();
  });

  it('stays in edit mode when save rejects', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('nope'));
    render(<InlineNameEditor label="view name" onSave={onSave} value="Old" />);
    await userEvent.click(screen.getByLabelText('Edit view name'));
    await userEvent.click(screen.getByLabelText('Save view name'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
