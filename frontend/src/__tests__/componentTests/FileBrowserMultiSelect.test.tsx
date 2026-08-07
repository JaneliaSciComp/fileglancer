import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { render } from '../test-utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

function Probe() {
  const { fileBrowserState, toggleChecked, checkPaths, clearChecked } =
    useFileBrowserContext();
  return (
    <div>
      <span data-testid="count">{fileBrowserState.checkedPaths.size}</span>
      <button onClick={() => toggleChecked('/dir/a.txt')}>toggle-a</button>
      <button onClick={() => checkPaths(['/dir/a.txt', '/dir/b.txt'])}>
        check-two
      </button>
      <button onClick={() => clearChecked()}>clear</button>
    </div>
  );
}

describe('FileBrowser multi-select checked set', () => {
  it('toggles, unions, and clears checked paths (independent of the network)', async () => {
    const user = userEvent.setup();
    render(<Probe />, { initialEntries: ['/browse/myFsp/dir'] });
    const count = () => screen.getByTestId('count').textContent;

    expect(count()).toBe('0');
    await user.click(screen.getByText('toggle-a'));
    expect(count()).toBe('1'); // added
    await user.click(screen.getByText('toggle-a'));
    expect(count()).toBe('0'); // toggled off
    await user.click(screen.getByText('check-two'));
    expect(count()).toBe('2'); // union
    await user.click(screen.getByText('check-two'));
    expect(count()).toBe('2'); // union is idempotent (no duplicates)
    await user.click(screen.getByText('clear'));
    expect(count()).toBe('0');
  });
});
