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
  it('pre-fills the name input with defaultName and checks out with it when data links are automatic', async () => {
    const user = userEvent.setup();
    render(<CreateViewButton datasets={datasets} defaultName="V" />);
    await user.click(screen.getByRole('button', { name: /create view/i }));

    const input = await screen.findByRole('textbox', { name: /view name/i });
    expect(input).toHaveValue('V');
    // no consent copy needed since data links are automatic
    expect(
      screen.queryByText(/are you sure you want to create a data link/i)
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^create$/i }));
    expect(checkout).toHaveBeenCalledWith(datasets, 'V');
  });

  it('checks out with the edited name, not defaultName', async () => {
    const user = userEvent.setup();
    render(<CreateViewButton datasets={datasets} defaultName="V" />);
    await user.click(screen.getByRole('button', { name: /create view/i }));

    const input = await screen.findByRole('textbox', { name: /view name/i });
    await user.clear(input);
    await user.type(input, 'My Renamed View');

    await user.click(screen.getByRole('button', { name: /^create$/i }));
    expect(checkout).toHaveBeenCalledWith(datasets, 'My Renamed View');
  });

  it('disables the create button when the name is empty', async () => {
    const user = userEvent.setup();
    render(<CreateViewButton datasets={datasets} defaultName="V" />);
    await user.click(screen.getByRole('button', { name: /create view/i }));

    const input = await screen.findByRole('textbox', { name: /view name/i });
    await user.clear(input);

    expect(screen.getByRole('button', { name: /^create$/i })).toBeDisabled();
    expect(checkout).not.toHaveBeenCalled();
  });

  it('shows data-link consent copy when not automatic, then checks out on confirm with the edited name', async () => {
    automatic = false;
    const user = userEvent.setup();
    render(<CreateViewButton datasets={datasets} defaultName="V" />);
    await user.click(screen.getByRole('button', { name: /create view/i }));

    expect(
      await screen.findByText(/are you sure you want to create a data link/i)
    ).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: /view name/i });
    await user.clear(input);
    await user.type(input, 'Linked View');

    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(checkout).toHaveBeenCalledWith(datasets, 'Linked View');
  });
});
