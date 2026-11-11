import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import AppPageHeader from '@/components/ui/AppsPage/AppPageHeader';

describe('AppPageHeader', () => {
  it('renders the description as markdown', () => {
    render(
      <MemoryRouter>
        <AppPageHeader
          description={'| Col A | Col B |\n|---|---|\n| 1 | 2 |'}
          title="My Job"
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Col A')).toBeInTheDocument();
  });
});
