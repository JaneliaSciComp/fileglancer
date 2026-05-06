import { expect, within } from 'storybook/test';
import { HiHome, HiSearch } from 'react-icons/hi';
import type { Meta, StoryObj } from '@storybook/react-vite';

import FgIcon from './FgIcon';

const iconMap = {
  HiHome: HiHome,
  HiSearch: HiSearch
};

const meta = {
  title: 'Atoms/FgIcon',
  component: FgIcon,
  argTypes: {
    icon: {
      control: 'select',
      options: Object.keys(iconMap),
      mapping: iconMap
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg']
    },
    color: {
      control: 'select',
      options: [
        undefined,
        'primary',
        'secondary',
        'error',
        'success',
        'warning',
        'info'
      ]
    }
  },
  args: {
    icon: HiHome,
    label: 'Home'
  }
} satisfies Meta<typeof FgIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const wrapper = canvas.getByRole('img', { name: 'Home' });

    await expect(wrapper).toBeInTheDocument();
    await expect(wrapper).toHaveAttribute('aria-label', 'Home');
  }
};

export const Decorative: Story = {
  args: {
    label: undefined
  },
  play: async ({ canvasElement }) => {
    const wrapper = canvasElement.querySelector('[aria-hidden="true"]');

    await expect(wrapper).toBeInTheDocument();
  }
};

export const Sizes: Story = {
  render: args => (
    <div className="flex flex-wrap items-center gap-3">
      <FgIcon {...args} label="Home xs" size="xs" />
      <FgIcon {...args} label="Home sm" size="sm" />
      <FgIcon {...args} label="Home md" size="md" />
      <FgIcon {...args} label="Home lg" size="lg" />
    </div>
  )
};

export const Colors: Story = {
  render: args => (
    <div className="flex flex-wrap items-center gap-3">
      <FgIcon {...args} color="primary" label="Primary" />
      <FgIcon {...args} color="secondary" label="Secondary" />
      <FgIcon {...args} color="error" label="Error" />
      <FgIcon {...args} color="success" label="Success" />
      <FgIcon {...args} color="warning" label="Warning" />
      <FgIcon {...args} color="info" label="Info" />
    </div>
  )
};

export const WithCustomClassName: Story = {
  args: {
    className: 'text-red-500',
    label: 'Custom styled icon'
  }
};
