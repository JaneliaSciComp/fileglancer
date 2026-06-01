import { expect, fn, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

import FgInput from './FgInput';

const meta = {
  title: 'Atoms/FormElements/FgInput',
  component: FgInput,
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg']
    },
    error: {
      control: 'boolean'
    },
    disabled: {
      control: 'boolean'
    }
  },
  args: {
    placeholder: 'Type here…',
    onChange: fn()
  }
} satisfies Meta<typeof FgInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByPlaceholderText('Type here…');

    await userEvent.type(input, 'hello');
    await expect(input).toHaveValue('hello');
    await expect(args.onChange).toHaveBeenCalled();
  }
};

export const Sizes: Story = {
  render: args => (
    <div className="flex flex-col gap-3 w-72">
      <FgInput {...args} placeholder="Small" size="sm" />
      <FgInput {...args} placeholder="Medium" size="md" />
      <FgInput {...args} placeholder="Large" size="lg" />
    </div>
  )
};

export const Error: Story = {
  args: {
    error: true,
    defaultValue: 'invalid value'
  },
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector('input')!;
    await expect(input.className).toContain('border-error');
  }
};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: 'cannot edit'
  },
  play: async ({ args, canvasElement }) => {
    const input = canvasElement.querySelector('input')!;

    await expect(input).toBeDisabled();
    await userEvent.type(input, 'nope');
    await expect(args.onChange).not.toHaveBeenCalled();
  }
};

export const WithValue: Story = {
  args: {
    defaultValue: 'Prefilled text'
  }
};
