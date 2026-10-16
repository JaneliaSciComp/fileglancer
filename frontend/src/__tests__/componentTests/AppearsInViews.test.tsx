import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const { useViewsForDataLinkQuery } = vi.hoisted(() => ({
  useViewsForDataLinkQuery: vi.fn()
}));
vi.mock('@/queries/viewQueries', () => ({ useViewsForDataLinkQuery }));

import AppearsInViews from '@/components/ui/PropertiesDrawer/AppearsInViews';

describe('AppearsInViews', () => {
  it('lists the dependent Views with a count', () => {
    useViewsForDataLinkQuery.mockReturnValue({
      data: [
        { short_key: 'v1', name: 'Alpha', read_key: 'rk1' },
        { short_key: 'v2', name: 'Beta', read_key: 'rk2' }
      ],
      isPending: false,
      isError: false
    });
    render(
      <MemoryRouter>
        <AppearsInViews sharingKey="k1" />
      </MemoryRouter>
    );
    expect(screen.getByText(/appears in 2 views/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute(
      'href',
      '/view/rk1'
    );
    expect(screen.getByRole('link', { name: 'Beta' })).toHaveAttribute(
      'href',
      '/view/rk2'
    );
  });

  it('renders nothing when there are no dependent Views', () => {
    useViewsForDataLinkQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false
    });
    const { container } = render(<AppearsInViews sharingKey="k1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
