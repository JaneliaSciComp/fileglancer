import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const { useViewsForDataLinkQuery, useViewsForDatasetQuery } = vi.hoisted(
  () => ({
    useViewsForDataLinkQuery: vi.fn(),
    useViewsForDatasetQuery: vi.fn()
  })
);
vi.mock('@/queries/viewQueries', () => ({
  useViewsForDataLinkQuery,
  useViewsForDatasetQuery
}));

// What a disabled TanStack query returns
const disabled = { data: undefined, isPending: true, isError: false };

import AppearsInViews from '@/components/ui/PropertiesDrawer/AppearsInViews';

describe('AppearsInViews', () => {
  it('lists the dependent Views with a count', () => {
    useViewsForDatasetQuery.mockReturnValue(disabled);
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

  it('lists the Views of a dataset without a Data Link', () => {
    useViewsForDataLinkQuery.mockReturnValue(disabled);
    useViewsForDatasetQuery.mockReturnValue({
      data: [{ short_key: 'v1', name: 'Alpha', read_key: 'rk1' }],
      isPending: false,
      isError: false
    });
    render(
      <MemoryRouter>
        <AppearsInViews fspName="idr" path="zarr/img.zarr" />
      </MemoryRouter>
    );
    expect(useViewsForDatasetQuery).toHaveBeenCalledWith(
      'idr',
      'zarr/img.zarr'
    );
    expect(screen.getByText(/appears in 1 view$/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute(
      'href',
      '/view/rk1'
    );
  });

  it('renders nothing when there are no dependent Views', () => {
    useViewsForDatasetQuery.mockReturnValue(disabled);
    useViewsForDataLinkQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false
    });
    const { container } = render(<AppearsInViews sharingKey="k1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
