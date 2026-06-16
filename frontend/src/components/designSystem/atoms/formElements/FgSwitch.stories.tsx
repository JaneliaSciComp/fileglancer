import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

import FgSwitch from './FgSwitch';

const meta = {
  title: 'Atoms/FormElements/FgSwitch',
  component: FgSwitch,
  argTypes: {
    disabled: {
      control: 'boolean'
    },
    showState: {
      control: 'boolean'
    },
    checked: {
      control: 'boolean'
    }
  },
  args: {
    id: 'demo-switch',
    label: 'Enable notifications',
    checked: false,
    onChange: fn()
  }
} satisfies Meta<typeof FgSwitch>;

export default meta;

type Story = StoryObj<typeof meta>;

function Controlled({
  initial,
  ...args
}: React.ComponentProps<typeof FgSwitch> & { readonly initial?: boolean }) {
  const [checked, setChecked] = useState(initial ?? false);
  return (
    <FgSwitch
      {...args}
      checked={checked}
      onChange={() => {
        setChecked(prev => !prev);
        args.onChange?.();
      }}
    />
  );
}

export const Default: Story = {
  render: args => <Controlled {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByLabelText(/enable notifications/i);

    await expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await expect(args.onChange).toHaveBeenCalled();
    await expect(toggle).toBeChecked();
  }
};

export const Checked: Story = {
  render: args => <Controlled {...args} initial />
};

export const Disabled: Story = {
  args: {
    disabled: true
  },
  render: args => <Controlled {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByLabelText(/enable notifications/i);

    await expect(toggle).toBeDisabled();
    await userEvent.click(toggle);
    await expect(args.onChange).not.toHaveBeenCalled();
  }
};

export const WithState: Story = {
  args: {
    showState: true
  },
  render: args => <Controlled {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByLabelText(/enable notifications/i);

    await expect(canvas.getAllByText('Off').length).toBeGreaterThan(0);

    await userEvent.click(toggle);

    await expect(canvas.getAllByText('On').length).toBeGreaterThan(0);
  }
};
