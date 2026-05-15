import { expect, fn, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

import FgCheckbox from './FgCheckbox';

const meta = {
  title: 'Atoms/FormElements/FgCheckbox',
  component: FgCheckbox,
  argTypes: {
    color: {
      control: 'inline-radio',
      options: ['primary', 'secondary']
    },
    hideLabel: {
      control: 'boolean'
    },
    disabled: {
      control: 'boolean'
    }
  },
  args: {
    label: 'Accept terms',
    onChange: fn()
  }
} satisfies Meta<typeof FgCheckbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole('checkbox', { name: /accept terms/i });

    await expect(checkbox).toHaveAttribute('type', 'checkbox');
    await expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);
    await expect(args.onChange).toHaveBeenCalledTimes(1);
    await expect(checkbox).toBeChecked();
  }
};

export const Colors: Story = {
  render: args => (
    <div className="flex flex-wrap items-center gap-6">
      <FgCheckbox {...args} color="primary" label="Primary" />
      <FgCheckbox {...args} color="secondary" label="Secondary" />
    </div>
  )
};

export const Disabled: Story = {
  args: {
    disabled: true
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole('checkbox', { name: /accept terms/i });

    await expect(checkbox).toBeDisabled();

    await userEvent.click(checkbox);
    await expect(args.onChange).not.toHaveBeenCalled();
  }
};

export const Checked: Story = {
  args: {
    defaultChecked: true
  }
};

export const HiddenLabel: Story = {
  args: {
    hideLabel: true,
    label: 'Hidden but accessible label'
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole('checkbox');

    await expect(checkbox).toHaveAttribute(
      'aria-label',
      'Hidden but accessible label'
    );
    await expect(
      canvas.queryByText('Hidden but accessible label')
    ).not.toBeInTheDocument();
  }
};
