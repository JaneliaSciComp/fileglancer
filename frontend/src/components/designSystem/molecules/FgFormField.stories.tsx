import { expect, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

import FgFormField from './FgFormField';
import FgInput from '../atoms/formElements/FgInput';
import FgTextarea from '../atoms/formElements/FgTextarea';
import FgSelect from '../atoms/formElements/FgSelect';

const meta = {
  title: 'Molecules/FgFormField',
  component: FgFormField,
  argTypes: {
    optional: {
      control: 'boolean'
    },
    error: {
      control: 'text'
    },
    helperText: {
      control: 'text'
    }
  },
  args: {
    label: 'Email',
    children: null
  }
} satisfies Meta<typeof FgFormField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: args => (
    <FgFormField {...args}>
      <FgInput placeholder="you@example.com" />
    </FgFormField>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Email');
    const label = canvas.getByText('Email');

    await expect(input).toBeInTheDocument();
    await expect(label.tagName).toBe('LABEL');
    await expect(label).toHaveAttribute('for', input.id);
  }
};

export const Optional: Story = {
  args: {
    optional: true,
    label: 'Nickname'
  },
  render: args => (
    <FgFormField {...args}>
      <FgInput placeholder="Optional nickname" />
    </FgFormField>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('(optional)')).toBeInTheDocument();
  }
};

export const WithHelperText: Story = {
  args: {
    helperText: 'We will never share your email.'
  },
  render: args => (
    <FgFormField {...args}>
      <FgInput placeholder="you@example.com" />
    </FgFormField>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const helper = canvas.getByText('We will never share your email.');
    const input = canvas.getByLabelText('Email');

    await expect(helper).toBeInTheDocument();
    await expect(input).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining(helper.id)
    );
  }
};

export const WithError: Story = {
  args: {
    error: 'Please enter a valid email address.'
  },
  render: args => (
    <FgFormField {...args}>
      <FgInput defaultValue="not-an-email" />
    </FgFormField>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const errorText = canvas.getByText('Please enter a valid email address.');
    const input = canvas.getByLabelText('Email');

    await expect(errorText).toBeInTheDocument();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining(errorText.id)
    );
    await expect((input as HTMLInputElement).className).toContain(
      'border-error'
    );
  }
};

export const WithTextarea: Story = {
  args: {
    label: 'Bio',
    helperText: 'Tell us a little about yourself.'
  },
  render: args => (
    <FgFormField {...args}>
      <FgTextarea placeholder="Your bio…" rows={4} />
    </FgFormField>
  )
};

export const WithSelect: Story = {
  args: {
    label: 'Favorite fruit'
  },
  render: args => (
    <FgFormField {...args}>
      <FgSelect>
        <option value="">Choose one…</option>
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
      </FgSelect>
    </FgFormField>
  )
};
