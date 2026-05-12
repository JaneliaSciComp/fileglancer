import { expect, fn, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

import FgLink from './FgLink';

const meta = {
  title: 'Atoms/FgLink',
  component: FgLink,
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg']
    }
  },
  args: {
    to: '/example',
    children: 'Example link',
    onClick: fn()
  }
} satisfies Meta<typeof FgLink>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', { name: 'Example link' });

    await expect(link).toHaveAttribute('href', '/example');

    await userEvent.click(link);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  }
};

export const Sizes: Story = {
  render: args => (
    <div className="flex flex-wrap items-center gap-3">
      <FgLink {...args} size="sm">
        Small link
      </FgLink>
      <FgLink {...args} size="md">
        Medium link
      </FgLink>
      <FgLink {...args} size="lg">
        Large link
      </FgLink>
    </div>
  )
};
