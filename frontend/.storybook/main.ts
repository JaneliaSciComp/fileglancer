import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/components/designSystem/**/*.stories.tsx'],
  addons: [
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-themes',
    '@storybook/addon-vitest',
    '@chromatic-com/storybook'
  ],
  framework: '@storybook/react-vite',
  core: {
    disableTelemetry: true
  }
};
export default config;
