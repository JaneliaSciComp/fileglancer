import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/hooks/useCartCount', () => ({ useCartCount: () => 3 }));

import BrowseRightRail from '@/components/ui/BrowsePage/BrowseRightRail';

describe('BrowseRightRail', () => {
  it('shows the cart count badge', () => {
    render(
      <BrowseRightRail isOpen={false} mode="properties" onSelect={vi.fn()} />
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calls onSelect with the clicked mode', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <BrowseRightRail isOpen={false} mode="properties" onSelect={onSelect} />
    );
    await user.click(screen.getByRole('button', { name: /layer cart/i }));
    expect(onSelect).toHaveBeenCalledWith('cart');
    await user.click(screen.getByRole('button', { name: /properties/i }));
    expect(onSelect).toHaveBeenCalledWith('properties');
  });
});
