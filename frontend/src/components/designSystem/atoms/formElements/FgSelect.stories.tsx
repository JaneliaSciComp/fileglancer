import { expect, fn, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

import FgSelect from './FgSelect';

const options = (
  <>
    <option value="">Choose one…</option>
    <option value="apple">Apple</option>
    <option value="banana">Banana</option>
    <option value="cherry">Cherry</option>
  </>
);

const meta = {
  title: 'Atoms/FormElements/FgSelect',
  component: FgSelect,
  argTypes: {
    error: {
      control: 'boolean'
    },
    disabled: {
      control: 'boolean'
    }
  },
  args: {
    'aria-label': 'Fruit',
    onChange: fn(),
    children: options
  }
} satisfies Meta<typeof FgSelect>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByRole('combobox', { name: 'Fruit' });

    await userEvent.selectOptions(select, 'banana');
    await expect(select).toHaveValue('banana');
    await expect(args.onChange).toHaveBeenCalled();
  }
};

export const Error: Story = {
  args: {
    error: true
  },
  play: async ({ canvasElement }) => {
    const select = canvasElement.querySelector('select')!;
    await expect(select.className).toContain('border-error');
  }
};

export const Disabled: Story = {
  args: {
    disabled: true
  },
  play: async ({ canvasElement }) => {
    const select = canvasElement.querySelector('select')!;
    await expect(select).toBeDisabled();
  }
};

export const WithDefaultValue: Story = {
  args: {
    defaultValue: 'cherry'
  },
  play: async ({ canvasElement }) => {
    const select = canvasElement.querySelector('select')!;
    await expect(select).toHaveValue('cherry');
  }
};
