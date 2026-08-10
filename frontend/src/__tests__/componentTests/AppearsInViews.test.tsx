import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useViewsForDataLinkQuery } = vi.hoisted(() => ({
  useViewsForDataLinkQuery: vi.fn()
}));
vi.mock('@/queries/viewQueries', () => ({ useViewsForDataLinkQuery }));

import AppearsInViews from '@/components/ui/PropertiesDrawer/AppearsInViews';

describe('AppearsInViews', () => {
  it('lists the dependent Views with a count', () => {
    useViewsForDataLinkQuery.mockReturnValue({
      data: [
        { short_key: 'v1', name: 'Alpha' },
        { short_key: 'v2', name: 'Beta' }
      ],
      isPending: false,
      isError: false
    });
    render(<AppearsInViews sharingKey="k1" />);
    expect(screen.getByText(/appears in 2 views/i)).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
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
