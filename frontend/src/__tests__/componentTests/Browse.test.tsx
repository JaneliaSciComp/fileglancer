import { describe, it, expect, beforeEach, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { render, screen } from '@/__tests__/test-utils';
import Browse from '@/components/Browse';

// Mock the StartTour component to avoid ShepherdJourneyProvider dependency
vi.mock('@/components/tours/StartTour', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  )
}));

// Mock useOutletContext since Browse requires it
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useOutletContext: () => ({
      setShowPermissionsDialog: vi.fn(),
      togglePropertiesDrawer: vi.fn(),
      toggleSidebar: vi.fn(),
      setShowConvertFileDialog: vi.fn(),
      showPermissionsDialog: false,
      showPropertiesDrawer: false,
      showSidebar: false,
      showConvertFileDialog: false
    })
  };
});

describe('Browse - WelcomeTutorialCard visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows WelcomeTutorialCard on dashboard when showTutorial is true', async () => {
    render(<Browse />, { initialEntries: ['/browse'] });

    await waitFor(() => {
      expect(screen.getByText('Welcome to Fileglancer!')).toBeInTheDocument();
    });
  });

  it('does not show WelcomeTutorialCard after the user selects to hide it', async () => {
    render(<Browse />, { initialEntries: ['/browse'] });
    await waitFor(() => {
      expect(screen.getByText('Welcome to Fileglancer!')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const checkbox = screen.getByRole('checkbox', { name: /hide this card/i });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);

    await waitFor(() => {
      expect(
        screen.queryByText('Welcome to Fileglancer!')
      ).not.toBeInTheDocument();
    });
  });
});
