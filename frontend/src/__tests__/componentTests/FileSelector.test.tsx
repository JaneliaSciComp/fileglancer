import { describe, it, expect, beforeEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import FileSelectorButton from '@/components/ui/FileSelector/FileSelectorButton';
import { render, screen, waitFor } from '@/__tests__/test-utils';
import { server } from '@/__tests__/mocks/node';

describe('FileSelector', () => {
  const onSelect = vi.fn();

  describe('Smoke tests', () => {
    it('opens dialog when button is clicked', async () => {
      const user = userEvent.setup();
      render(<FileSelectorButton onSelect={onSelect} />, {
        initialEntries: ['/browse']
      });

      await user.click(screen.getByRole('button', { name: /browse/i }));

      await waitFor(() => {
        expect(screen.getByText('Select File or Folder')).toBeInTheDocument();
      });
    });

    it('displays zones at top level', async () => {
      const user = userEvent.setup();
      render(<FileSelectorButton onSelect={onSelect} />, {
        initialEntries: ['/browse']
      });

      await user.click(screen.getByRole('button', { name: /browse/i }));

      await waitFor(() => {
        expect(screen.getByText('Zone1')).toBeInTheDocument();
      });
      expect(screen.getByText('Zone2')).toBeInTheDocument();
    });

    it('closes dialog when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<FileSelectorButton onSelect={onSelect} />, {
        initialEntries: ['/browse']
      });

      await user.click(screen.getByRole('button', { name: /browse/i }));

      await waitFor(() => {
        expect(screen.getByText('Select File or Folder')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(
          screen.queryByText('Select File or Folder')
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Search functionality', () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      render(<FileSelectorButton onSelect={onSelect} />, {
        initialEntries: ['/browse']
      });

      await user.click(screen.getByRole('button', { name: /browse/i }));

      await waitFor(() => {
        expect(screen.getByText('Zone1')).toBeInTheDocument();
      });
    });

    it('shows search input at zones level', () => {
      expect(screen.getByPlaceholderText('Type to filter')).toBeInTheDocument();
    });

    it('filters displayed zones by name when typing in search', async () => {
      const user = userEvent.setup();

      const searchInput = screen.getByPlaceholderText('Type to filter');
      await user.click(searchInput);
      await user.keyboard('1');

      expect(screen.getByText('Zone1')).toBeInTheDocument();
      expect(screen.queryByText('Zone2')).not.toBeInTheDocument();
    });

    it('restores full list when search is cleared', async () => {
      const user = userEvent.setup();

      const searchInput = screen.getByPlaceholderText('Type to filter');
      await user.click(searchInput);
      await user.keyboard('1');

      expect(screen.queryByText('Zone2')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /clear search/i }));

      await waitFor(() => {
        expect(screen.getByText('Zone1')).toBeInTheDocument();
        expect(screen.getByText('Zone2')).toBeInTheDocument();
      });
    });

    it('clears search when navigating into a zone', async () => {
      const user = userEvent.setup();

      const searchInput = screen.getByPlaceholderText('Type to filter');
      await user.click(searchInput);
      await user.keyboard('Zone');

      expect(searchInput).toHaveValue('Zone');

      // Double-click Zone1 to navigate into it
      await user.dblClick(screen.getByText('Zone1'));

      await waitFor(() => {
        const input = screen.getByPlaceholderText('Type to filter');
        expect(input).toHaveValue('');
      });
    });
  });

  describe('FSP-level search', () => {
    it('filters FSPs by name when typing in search at zone level', async () => {
      // Add a second FSP in Zone1 so we can test filtering
      server.use(
        http.get('/api/file-share-paths', () => {
          return HttpResponse.json({
            paths: [
              {
                name: 'test_fsp',
                zone: 'Zone1',
                group: 'group1',
                storage: 'primary',
                mount_path: '/test/fsp',
                mac_path: 'smb://test/fsp',
                windows_path: '\\\\test\\fsp',
                linux_path: '/test/fsp'
              },
              {
                name: 'alpha_fsp',
                zone: 'Zone1',
                group: 'group1',
                storage: 'primary',
                mount_path: '/alpha/fsp',
                mac_path: 'smb://alpha/fsp',
                windows_path: '\\\\alpha\\fsp',
                linux_path: '/alpha/fsp'
              }
            ]
          });
        })
      );

      const user = userEvent.setup();
      render(<FileSelectorButton onSelect={onSelect} />, {
        initialEntries: ['/browse']
      });

      await user.click(screen.getByRole('button', { name: /browse/i }));

      await waitFor(() => {
        expect(screen.getByText('Zone1')).toBeInTheDocument();
      });

      // Navigate into Zone1
      await user.dblClick(screen.getByText('Zone1'));

      await waitFor(() => {
        expect(screen.getByText('/test/fsp')).toBeInTheDocument();
        expect(screen.getByText('/alpha/fsp')).toBeInTheDocument();
      });

      // Filter by typing
      const searchInput = screen.getByPlaceholderText('Type to filter');
      await user.click(searchInput);
      await user.keyboard('alpha');

      expect(screen.getByText('/alpha/fsp')).toBeInTheDocument();
      expect(screen.queryByText('/test/fsp')).not.toBeInTheDocument();
    });
  });

  describe('Group filter status', () => {
    it('hides status message when user has no groups', async () => {
      const user = userEvent.setup();
      render(<FileSelectorButton onSelect={onSelect} />, {
        initialEntries: ['/browse']
      });

      await user.click(screen.getByRole('button', { name: /browse/i }));

      await waitFor(() => {
        expect(screen.getByText('Zone1')).toBeInTheDocument();
      });

      expect(
        screen.queryByText('Viewing zones for your groups only')
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Viewing all zones')).not.toBeInTheDocument();
    });

    it('shows "Viewing zones for your groups only" when user has groups and isFilteredByGroups is true', async () => {
      server.use(
        http.get('/api/profile', () => {
          return HttpResponse.json({
            username: 'testuser',
            groups: ['group1']
          });
        })
      );

      const user = userEvent.setup();
      render(<FileSelectorButton onSelect={onSelect} />, {
        initialEntries: ['/browse']
      });

      await user.click(screen.getByRole('button', { name: /browse/i }));

      await waitFor(() => {
        expect(
          screen.getByText('Viewing zones for your groups only')
        ).toBeInTheDocument();
      });
    });

    it('hides status message at filesystem level', async () => {
      server.use(
        http.get('/api/profile', () => {
          return HttpResponse.json({
            username: 'testuser',
            groups: ['group1']
          });
        })
      );

      const user = userEvent.setup();
      render(<FileSelectorButton onSelect={onSelect} />, {
        initialEntries: ['/browse']
      });

      await user.click(screen.getByRole('button', { name: /browse/i }));

      await waitFor(() => {
        expect(screen.getByText('Zone1')).toBeInTheDocument();
      });

      // Navigate into Zone1
      await user.dblClick(screen.getByText('Zone1'));

      // At zone level, FSPs are displayed using their preferred path format
      await waitFor(() => {
        expect(screen.getByText('/test/fsp')).toBeInTheDocument();
      });

      // Navigate into FSP
      await user.dblClick(screen.getByText('/test/fsp'));

      await waitFor(() => {
        expect(
          screen.queryByText('Viewing zones for your groups only')
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Viewing all zones')).not.toBeInTheDocument();
      });
    });
  });
});
