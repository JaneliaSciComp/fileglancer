import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';

import Sidebar from '@/components/ui/Sidebar/Sidebar';
import { render, screen, waitFor } from '@/__tests__/test-utils';

describe('Sidebar', () => {
  beforeEach(async () => {
    render(<Sidebar />, { initialEntries: ['/browse'] });
    await waitFor(() => {
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });
  });

  it('displays all zones initially', async () => {
    // Wait for zones to load from the API
    await waitFor(() => {
      expect(screen.getByText('Zone1')).toBeInTheDocument();
    });
    expect(screen.getByText('Zone2')).toBeInTheDocument();
  });

  it('filters zones', async () => {
    const user = userEvent.setup();

    await user.click(screen.getByRole('searchbox'));
    await user.keyboard('1');

    expect(screen.getByText('Zone1')).toBeInTheDocument();
    expect(screen.queryByText('Zone 2')).not.toBeInTheDocument();
  });
});
