import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import EditDataLinkLabelDialog from '@/components/ui/Dialogs/EditDataLinkLabel';

describe('EditDataLinkLabelDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with current label', () => {
    render(
      <EditDataLinkLabelDialog
        open={true}
        onClose={mockOnClose}
        currentLabel="my-link"
        onConfirm={mockOnConfirm}
      />
    );

    const input = screen.getByPlaceholderText('Enter label');
    expect(input).toHaveValue('my-link');
    expect(screen.getByText('Edit Data Link Label')).toBeInTheDocument();
  });

  it('has Save button disabled when value is unchanged', () => {
    render(
      <EditDataLinkLabelDialog
        open={true}
        onClose={mockOnClose}
        currentLabel="my-link"
        onConfirm={mockOnConfirm}
      />
    );

    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeDisabled();
  });

  it('has Save button disabled when input is empty', async () => {
    const user = userEvent.setup();

    render(
      <EditDataLinkLabelDialog
        open={true}
        onClose={mockOnClose}
        currentLabel="my-link"
        onConfirm={mockOnConfirm}
      />
    );

    const input = screen.getByPlaceholderText('Enter label');
    await user.clear(input);

    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeDisabled();
  });

  it('has Save button enabled when value is changed', async () => {
    const user = userEvent.setup();

    render(
      <EditDataLinkLabelDialog
        open={true}
        onClose={mockOnClose}
        currentLabel="my-link"
        onConfirm={mockOnConfirm}
      />
    );

    const input = screen.getByPlaceholderText('Enter label');
    await user.clear(input);
    await user.type(input, 'new-name');

    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).not.toBeDisabled();
  });

  it('calls onConfirm with new label on save', async () => {
    const user = userEvent.setup();

    render(
      <EditDataLinkLabelDialog
        open={true}
        onClose={mockOnClose}
        currentLabel="my-link"
        onConfirm={mockOnConfirm}
      />
    );

    const input = screen.getByPlaceholderText('Enter label');
    await user.clear(input);
    await user.type(input, 'new-name');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith('new-name');
    });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();

    render(
      <EditDataLinkLabelDialog
        open={true}
        onClose={mockOnClose}
        currentLabel="my-link"
        onConfirm={mockOnConfirm}
      />
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockOnClose).toHaveBeenCalled();
  });
});
