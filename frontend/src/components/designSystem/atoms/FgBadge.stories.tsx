import type { Meta, StoryObj } from '@storybook/react-vite';

import FgBadge from './FgBadge';

const meta = {
  title: 'Atoms/FgBadge',
  component: FgBadge,
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'pill']
    },
    color: {
      control: 'select',
      options: [
        'primary',
        'secondary',
        'success',
        'error',
        'warning',
        'info',
        'neutral'
      ]
    },
    size: {
      control: 'inline-radio',
      options: ['sm', 'md']
    }
  },
  args: {
    children: 'Badge'
  }
} satisfies Meta<typeof FgBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Colors: Story = {
  render: args => (
    <div className="flex flex-wrap items-center gap-3">
      <FgBadge {...args} color="primary">
        Primary
      </FgBadge>
      <FgBadge {...args} color="secondary">
        Secondary
      </FgBadge>
      <FgBadge {...args} color="success">
        Success
      </FgBadge>
      <FgBadge {...args} color="error">
        Error
      </FgBadge>
      <FgBadge {...args} color="warning">
        Warning
      </FgBadge>
      <FgBadge {...args} color="info">
        Info
      </FgBadge>
      <FgBadge {...args} color="neutral">
        Neutral
      </FgBadge>
    </div>
  )
};

export const Variants: Story = {
  render: args => (
    <div className="flex flex-wrap items-center gap-3">
      <FgBadge {...args} variant="default">
        Default
      </FgBadge>
      <FgBadge {...args} variant="pill">
        Pill
      </FgBadge>
    </div>
  )
};

export const Sizes: Story = {
  render: args => (
    <div className="flex flex-wrap items-center gap-3">
      <FgBadge {...args} size="sm">
        Small
      </FgBadge>
      <FgBadge {...args} size="md">
        Medium
      </FgBadge>
    </div>
  )
};

export const WithDot: Story = {
  render: args => (
    <div className="flex flex-wrap items-center gap-3">
      <FgBadge {...args} color="success" dot>
        Active
      </FgBadge>
      <FgBadge {...args} color="error" dot>
        Offline
      </FgBadge>
      <FgBadge {...args} color="warning" dot variant="pill">
        Pending
      </FgBadge>
    </div>
  )
};

export const CustomDotColor: Story = {
  args: {
    dot: true,
    dotColor: 'bg-red-500',
    children: 'Custom dot'
  }
};
