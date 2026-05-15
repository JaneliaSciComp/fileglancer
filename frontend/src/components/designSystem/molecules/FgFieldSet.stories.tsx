import { expect, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

import FgFieldSet from './FgFieldSet';
import FgRadio from '../atoms/formElements/FgRadio';
import FgCheckbox from '../atoms/formElements/FgCheckbox';

const meta = {
  title: 'Molecules/FgFieldSet',
  component: FgFieldSet,
  argTypes: {
    inline: {
      control: 'boolean'
    }
  },
  args: {
    legend: 'Choose a fruit',
    children: null
  }
} satisfies Meta<typeof FgFieldSet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: args => (
    <FgFieldSet {...args}>
      <div className="flex flex-col gap-2">
        <FgRadio id="fs-apple" label="Apple" name="fruit" />
        <FgRadio id="fs-banana" label="Banana" name="fruit" />
        <FgRadio id="fs-cherry" label="Cherry" name="fruit" />
      </div>
    </FgFieldSet>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const group = canvas.getByRole('group', { name: 'Choose a fruit' });
    await expect(group).toBeInTheDocument();
    await expect(canvas.getAllByRole('radio')).toHaveLength(3);
  }
};

export const Inline: Story = {
  args: {
    inline: true,
    legend: 'Toppings'
  },
  render: args => (
    <FgFieldSet {...args}>
      <FgCheckbox label="Cheese" />
      <FgCheckbox label="Mushrooms" />
      <FgCheckbox label="Olives" />
    </FgFieldSet>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('checkbox')).toHaveLength(3);
  }
};

export const WithCustomClassName: Story = {
  args: {
    className: 'p-4 rounded border border-surface-dark',
    legend: 'Styled wrapper'
  },
  render: args => (
    <FgFieldSet {...args}>
      <div className="flex flex-col gap-2">
        <FgRadio id="sw-a" label="Option A" name="styled" />
        <FgRadio id="sw-b" label="Option B" name="styled" />
      </div>
    </FgFieldSet>
  )
};
