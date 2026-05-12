import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { withThemeByClassName } from '@storybook/addon-themes';
import type { Preview } from '@storybook/react-vite';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i
      }
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    }
  },

  decorators: [
    // Wrap all stories in MemoryRouter so FgLink (react-router <Link>) works
    Story => createElement(MemoryRouter, null, createElement(Story)),

    // Dark mode toggle in the Storybook toolbar
    withThemeByClassName({
      themes: {
        light: '',
        dark: 'dark'
      },
      defaultTheme: 'light',
      parentSelector: 'html'
    })
  ]
};

export default preview;
