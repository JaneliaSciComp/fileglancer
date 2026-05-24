import type { Meta, StoryObj } from '@storybook/react-vite';

import FgExternalLink from './FgExternalLink';

const meta = {
  title: 'Atoms/FgExternalLink',
  component: FgExternalLink,
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg']
    }
  },
  args: {
    href: 'https://example.com',
    children: 'Example link'
  }
} satisfies Meta<typeof FgExternalLink>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAndWithoutIcon: Story = {
  render: args => (
    <div className="flex flex-wrap items-center gap-3">
      <FgExternalLink {...args}>With icon</FgExternalLink>
      <FgExternalLink {...args} showIcon={false}>
        Without icon
      </FgExternalLink>
    </div>
  )
};

export const Sizes: Story = {
  render: args => (
    <div className="flex flex-wrap items-center gap-3">
      <FgExternalLink {...args} size="sm">
        Small
      </FgExternalLink>
      <FgExternalLink {...args} size="md">
        Medium
      </FgExternalLink>
      <FgExternalLink {...args} size="lg">
        Large
      </FgExternalLink>
    </div>
  )
};

export const CustomClassName: Story = {
  args: {
    className: 'font-bold',
    children: 'Bold link'
  }
};
