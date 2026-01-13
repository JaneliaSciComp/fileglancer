import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import toast from 'react-hot-toast';
import { render, screen } from '@/__tests__/test-utils';
import WelcomeTutorialCard from '@/components/ui/BrowsePage/Dashboard/WelcomeTutorialCard';

// Mock the StartTour component to avoid ShepherdJourneyProvider dependency
vi.mock('@/components/tours/StartTour', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  )
}));

describe('WelcomeTutorialCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders welcome message and tour button', async () => {
    render(<WelcomeTutorialCard />, { initialEntries: ['/browse'] });

    await waitFor(() => {
      expect(screen.getByText('Welcome to Fileglancer!')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /start tour/i })
      ).toBeInTheDocument();
    });
  });

  it('displays checkbox with correct label and helper text', async () => {
    render(<WelcomeTutorialCard />, { initialEntries: ['/browse'] });

    await waitFor(() => {
      expect(
        screen.getByLabelText(/hide this card.*preferences/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/you can always start tutorials from the help page/i)
      ).toBeInTheDocument();
    });
  });

  it('checkbox reflects showTutorial preference state', async () => {
    render(<WelcomeTutorialCard />, { initialEntries: ['/browse'] });

    const checkbox = await screen.findByLabelText(/hide this card.*preferences/i);

    // showTutorial is true by default, so checkbox should be unchecked (inverse)
    expect(checkbox).not.toBeChecked();
  });

  it('toggles preference when checkbox is clicked and shows success toast', async () => {
    render(<WelcomeTutorialCard />, { initialEntries: ['/browse'] });

    const user = userEvent.setup();
    const checkbox = await screen.findByLabelText(/hide this card.*preferences/i);

    await user.click(checkbox);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Welcome card hidden. Re-enable it anytime in Preferences.'
      );
    });
  });

  it('shows error toast when preference update fails', async () => {
    const { server } = await import('@/__tests__/mocks/node');
    const { http, HttpResponse } = await import('msw');

    server.use(
      http.put('/api/preference/showTutorial', () => {
        return HttpResponse.json({ error: 'Update failed' }, { status: 500 });
      })
    );

    render(<WelcomeTutorialCard />, { initialEntries: ['/browse'] });

    const user = userEvent.setup();
    const checkbox = await screen.findByLabelText(/hide this card.*preferences/i);

    await user.click(checkbox);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(`500 Internal Server Error:
Update failed`);
    });
  });

  it('contains descriptive text about FileGlancer', async () => {
    render(<WelcomeTutorialCard />, { initialEntries: ['/browse'] });

    await waitFor(() => {
      expect(
        screen.getByText(
          /fileglancer helps you browse.*visualize.*share.*scientific imaging data/i
        )
      ).toBeInTheDocument();
    });
  });
});