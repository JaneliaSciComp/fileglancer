import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import WebknossosOptions from '@/components/ui/PreferencesPage/WebknossosOptions';
import type { ValidViewer } from '@/contexts/ViewersContext';
import type { ViewerUrlSources } from '@/contexts/PreferencesContext';

const template = 'https://wk.janelia.org/import?url={dataLink}';
const setViewerUrlSource = vi.fn();
let viewerUrlSources: ViewerUrlSources = {};
let validViewers: ValidViewer[] = [];

vi.mock('@/contexts/ViewersContext', () => ({
  useViewersContext: () => ({ validViewers })
}));
vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({ viewerUrlSources, setViewerUrlSource })
}));

const webknossos = {
  key: 'webknossos',
  displayName: 'WEBKNOSSOS',
  urlTemplate: template,
  manifestTemplateUrl: 'https://webknossos.org/import?url={dataLink}',
  logoPath: '',
  label: 'Import into WEBKNOSSOS',
  manifest: {} as ValidViewer['manifest']
} satisfies ValidViewer;

describe('WebknossosOptions', () => {
  beforeEach(() => {
    setViewerUrlSource.mockReset();
    setViewerUrlSource.mockResolvedValue({ success: true, data: undefined });
    viewerUrlSources = {};
    validViewers = [webknossos];
  });

  it('renders nothing when WEBKNOSSOS is not configured', () => {
    validViewers = [];
    const { container } = render(<WebknossosOptions />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the saved custom host', () => {
    viewerUrlSources = {
      webknossos: {
        custom: 'https://webknossos.example.org/import?url={dataLink}'
      }
    };
    render(<WebknossosOptions />);
    expect(screen.getByLabelText('WEBKNOSSOS host')).toHaveValue(
      'webknossos.example.org'
    );
  });

  it('saves a new host as a custom template', async () => {
    render(<WebknossosOptions />);
    const input = screen.getByLabelText('WEBKNOSSOS host');
    await userEvent.clear(input);
    await userEvent.type(input, 'webknossos.example.org');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(setViewerUrlSource).toHaveBeenCalledWith('webknossos', {
      custom: 'https://webknossos.example.org/import?url={dataLink}'
    });
  });

  it('clears the override when the default host is saved', async () => {
    viewerUrlSources = {
      webknossos: { custom: 'https://other.org/import?url={dataLink}' }
    };
    render(<WebknossosOptions />);
    const input = screen.getByLabelText('WEBKNOSSOS host');
    await userEvent.clear(input);
    await userEvent.type(input, 'wk.janelia.org');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(setViewerUrlSource).toHaveBeenCalledWith('webknossos', 'configured');
  });

  it('blocks saving an invalid host', async () => {
    render(<WebknossosOptions />);
    const input = screen.getByLabelText('WEBKNOSSOS host');
    await userEvent.clear(input);
    await userEvent.type(input, 'http://wk.example.org');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(
      screen.getByText('Enter a host name, such as wk.example.org')
    ).toBeInTheDocument();
  });
});
