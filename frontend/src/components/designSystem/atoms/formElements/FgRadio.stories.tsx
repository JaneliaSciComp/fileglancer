import { expect, fn, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

import FgRadio from './FgRadio';

const meta = {
  title: 'Atoms/FormElements/FgRadio',
  component: FgRadio,
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
    id: 'radio-option',
    label: 'Option',
    name: 'demo-group',
    onChange: fn()
  }
} satisfies Meta<typeof FgRadio>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const radio = canvas.getByRole('radio', { name: /option/i });

    await expect(radio).toHaveAttribute('type', 'radio');
    await userEvent.click(radio);

    await expect(radio).toBeChecked();
    await expect(args.onChange).toHaveBeenCalled();
  }
};

export const Group: Story = {
  render: args => (
    <div className="flex flex-col gap-2">
      <FgRadio
        {...args}
        defaultChecked
        id="group-a"
        label="Option A"
        value="a"
      />
      <FgRadio {...args} id="group-b" label="Option B" value="b" />
      <FgRadio {...args} id="group-c" label="Option C" value="c" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const optionB = canvas.getByRole('radio', { name: 'Option B' });

    await userEvent.click(optionB);
    await expect(optionB).toBeChecked();

    const optionA = canvas.getByRole('radio', { name: 'Option A' });
    await expect(optionA).not.toBeChecked();
  }
};

export const Colors: Story = {
  render: args => (
    <div className="flex flex-wrap items-center gap-6">
      <FgRadio {...args} color="primary" id="radio-primary" label="Primary" />
      <FgRadio
        {...args}
        color="secondary"
        id="radio-secondary"
        label="Secondary"
      />
    </div>
  )
};

export const Disabled: Story = {
  args: {
    disabled: true
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const radio = canvas.getByRole('radio', { name: /option/i });

    await expect(radio).toBeDisabled();
    await userEvent.click(radio);
    await expect(args.onChange).not.toHaveBeenCalled();
  }
};

export const HiddenLabel: Story = {
  args: {
    hideLabel: true,
    label: 'Hidden but accessible label'
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const radio = canvas.getByRole('radio');

    await expect(radio).toHaveAttribute(
      'aria-label',
      'Hidden but accessible label'
    );
  }
};
