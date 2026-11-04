import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import MarkdownText from '@/components/ui/MarkdownText';

describe('MarkdownText', () => {
  it('renders GFM tables as real tables', () => {
    render(<MarkdownText text={'| Col A | Col B |\n|---|---|\n| 1 | 2 |'} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Col A')).toBeInTheDocument();
  });

  it('renders links that open in a new tab', () => {
    render(<MarkdownText text="See [docs](https://example.org)." />);
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://example.org');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders nothing for empty text', () => {
    const { container } = render(<MarkdownText text={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
