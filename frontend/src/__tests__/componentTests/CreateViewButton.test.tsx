import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const checkout = vi.fn().mockResolvedValue({ short_key: 'v1', name: 'N' });
let automatic = true;

vi.mock('@/hooks/useCartCheckout', () => ({
  useCartCheckout: () => ({ checkout })
}));
vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({
    areDataLinksAutomatic: automatic,
    dataLinkSubpathMode: 'full_path',
    toggleAutomaticDataLinks: vi.fn()
  })
}));
vi.mock('@/queries/proxiedPathQueries', () => ({
  useAllProxiedPathsQuery: () => ({ data: [] }) // nothing exists → 1 new link
}));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));

import CreateViewButton from '@/components/ui/Views/CreateViewButton';

const datasets = [{ fsp_name: 'f', path: '/a', label: 'A' }];

beforeEach(() => {
  checkout.mockClear();
  automatic = true;
});

describe('CreateViewButton', () => {
  it('checks out directly when data links are automatic', async () => {
    const user = userEvent.setup();
    render(<CreateViewButton datasets={datasets} defaultName="V" />);
    await user.click(screen.getByRole('button', { name: /create view/i }));
    expect(checkout).toHaveBeenCalledWith(datasets, 'V');
  });

  it('shows a consent dialog when not automatic, then checks out on confirm', async () => {
    automatic = false;
    const user = userEvent.setup();
    render(<CreateViewButton datasets={datasets} defaultName="V" />);
    await user.click(screen.getByRole('button', { name: /create view/i }));
    expect(checkout).not.toHaveBeenCalled();
    // consent dialog visible → confirm
    await user.click(
      await screen.findByRole('button', {
        name: /create.*view|confirm|continue/i
      })
    );
    expect(checkout).toHaveBeenCalledWith(datasets, 'V');
  });
});
