import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';
import { waitFor } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/mocks/node';
import NGLinkDialog from '@/components/ui/Dialogs/NGLinkDialog';
import type { NGLink } from '@/queries/ngLinkQueries';
import { constructNeuroglancerUrl } from '@/utils';

// Mock the nglinks list endpoint so NGLinkProvider's query doesn't fail
server.use(
  http.get('/api/neuroglancer/nglinks', () => {
    return HttpResponse.json({ links: [] });
  })
);

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

const testState = { layers: [{ name: 'test-layer' }], position: [100, 200] };
const testBaseUrl = 'https://neuroglancer-demo.appspot.com/';

const editItem: NGLink = {
  short_key: 'abc123',
  short_name: 'test-link',
  title: 'Test Title',
  created_at: '2025-08-01T00:00:00',
  updated_at: '2025-08-01T00:00:00',
  state_url: 'http://localhost:7878/api/neuroglancer/state/abc123/test-link',
  neuroglancer_url: `${testBaseUrl}#!http://localhost:7878/api/neuroglancer/state/abc123/test-link`,
  state: testState,
  url_base: testBaseUrl
};

describe('NGLinkDialog', () => {
  describe('edit mode - URL mode', () => {
    it('prepopulates the URL field with the full Neuroglancer URL', async () => {
      renderWithQueryClient(
        <NGLinkDialog
          editItem={editItem}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          open={true}
          pending={false}
        />
      );

      const expectedUrl = constructNeuroglancerUrl(testState, testBaseUrl);
      await waitFor(() => {
        expect(screen.getByLabelText('Neuroglancer URL')).toHaveValue(
          expectedUrl
        );
      });
    });

    it('prepopulates the title field', async () => {
      renderWithQueryClient(
        <NGLinkDialog
          editItem={editItem}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          open={true}
          pending={false}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByLabelText('Title (optional, appears in tab name)')
        ).toHaveValue('Test Title');
      });
    });
  });

  describe('edit mode - State mode', () => {
    it('prepopulates JSON state and base URL when switching to state mode', async () => {
      renderWithQueryClient(
        <NGLinkDialog
          editItem={editItem}
          onClose={vi.fn()}
          onUpdate={vi.fn()}
          open={true}
          pending={false}
        />
      );

      const user = userEvent.setup();
      await user.click(screen.getByLabelText('State Mode'));

      expect(screen.getByLabelText('JSON State')).toHaveValue(
        JSON.stringify(testState, null, 2)
      );
      expect(screen.getByLabelText('Neuroglancer Base URL')).toHaveValue(
        testBaseUrl
      );
    });
  });

  describe('create mode', () => {
    it('starts with empty fields', () => {
      renderWithQueryClient(
        <NGLinkDialog
          onClose={vi.fn()}
          onCreate={vi.fn()}
          open={true}
          pending={false}
        />
      );

      expect(screen.getByLabelText('Neuroglancer URL')).toHaveValue('');
      expect(
        screen.getByLabelText('Title (optional, appears in tab name)')
      ).toHaveValue('');
      expect(
        screen.getByLabelText('Name (optional, used in shortened link)')
      ).toHaveValue('');
    });
  });
});
