import { expect, fn, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

import FgTextarea from './FgTextarea';

const meta = {
  title: 'Atoms/FormElements/FgTextarea',
  component: FgTextarea,
  argTypes: {
    error: {
      control: 'boolean'
    },
    disabled: {
      control: 'boolean'
    }
  },
  args: {
    placeholder: 'Tell us more…',
    rows: 4,
    onChange: fn()
  }
} satisfies Meta<typeof FgTextarea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByPlaceholderText('Tell us more…');

    await userEvent.type(textarea, 'multi\nline');
    await expect(textarea).toHaveValue('multi\nline');
    await expect(args.onChange).toHaveBeenCalled();
  }
};

export const Error: Story = {
  args: {
    error: true,
    defaultValue: 'invalid content'
  },
  play: async ({ canvasElement }) => {
    const textarea = canvasElement.querySelector('textarea')!;
    await expect(textarea.className).toContain('border-error');
  }
};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: 'cannot edit'
  },
  play: async ({ args, canvasElement }) => {
    const textarea = canvasElement.querySelector('textarea')!;

    await expect(textarea).toBeDisabled();
    await userEvent.type(textarea, 'nope');
    await expect(args.onChange).not.toHaveBeenCalled();
  }
};

export const WithValue: Story = {
  args: {
    defaultValue: 'Some prefilled content\nacross multiple lines.'
  }
};
