import { expect, fn, userEvent, within } from 'storybook/test';
import { HiDownload, HiOutlinePlus, HiSearch } from 'react-icons/hi';
import type { Meta, StoryObj } from '@storybook/react-vite';

import FgButton from './FgButton';

const iconMap = {
  None: undefined,
  HiDownload: HiDownload,
  HiSearch: HiSearch
};

const meta = {
  title: 'Atoms/FgButton',
  component: FgButton,
  argTypes: {
    variant: {
      control: 'select',
      options: ['solid', 'outline', 'ghost', 'link']
    },
    color: {
      control: 'select',
      options: ['primary', 'secondary', 'error', 'success', 'warning', 'info']
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg']
    },
    icon: {
      control: 'select',
      options: Object.keys(iconMap),
      mapping: iconMap
    },
    iconPosition: {
      control: 'inline-radio',
      options: ['left', 'right']
    }
  },
  args: {
    children: 'Button',
    onClick: fn()
  }
} satisfies Meta<typeof FgButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: /button/i });

    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  }
};

export const Variants: Story = {
  render: args => (
    <div className="flex flex-wrap items-center gap-3">
      <FgButton {...args} variant="solid">
        Solid
      </FgButton>
      <FgButton {...args} variant="outline">
        Outline
      </FgButton>
      <FgButton {...args} variant="ghost">
        Ghost
      </FgButton>
      <FgButton {...args} variant="link">
        Link
      </FgButton>
    </div>
  )
};

export const Colors: Story = {
  render: args => (
    <div className="flex flex-wrap items-center gap-3">
      <FgButton {...args} color="primary">
        Primary
      </FgButton>
      <FgButton {...args} color="secondary">
        Secondary
      </FgButton>
      <FgButton {...args} color="error">
        Error
      </FgButton>
      <FgButton {...args} color="success">
        Success
      </FgButton>
      <FgButton {...args} color="warning">
        Warning
      </FgButton>
      <FgButton {...args} color="info">
        Info
      </FgButton>
    </div>
  )
};

export const Loading: Story = {
  args: {
    loading: true,
    loadingText: 'Saving...'
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByTitle('Loading spinner')).toBeInTheDocument();
    await expect(canvas.getByText('Saving...')).toBeInTheDocument();

    const button = canvas.getByRole('button');
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  }
};

export const WithIcon: Story = {
  render: args => (
    <div className="flex flex-wrap items-center gap-3">
      <FgButton {...args} icon={HiDownload} iconPosition="left">
        Download
      </FgButton>
      <FgButton {...args} icon={HiSearch} iconPosition="right">
        Search
      </FgButton>
    </div>
  )
};

export const Disabled: Story = {
  args: {
    disabled: true
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: /button/i });

    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  }
};

export const LinkVariantWithIcon: Story = {
  args: {
    variant: 'link',
    icon: HiOutlinePlus,
    size: 'sm',
    children: 'Add something'
  }
};

export const AsLink: Story = {
  args: {
    children: 'Open',
    href: 'https://example.com',
    target: '_blank',
    rel: 'noopener'
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', { name: /open/i });

    await expect(link).toHaveAttribute('href', 'https://example.com');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');

    await userEvent.click(link);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  }
};

export const DisabledLink: Story = {
  args: {
    children: 'Open',
    href: 'https://example.com',
    disabled: true
  },
  play: async ({ canvasElement }) => {
    const anchor = canvasElement.querySelector('a')!;

    await expect(anchor).not.toHaveAttribute('href');
    await expect(anchor).toHaveAttribute('aria-disabled', 'true');
  }
};

export const LoadingLink: Story = {
  args: {
    children: 'Open',
    href: 'https://example.com',
    loading: true,
    loadingText: 'Loading...'
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const anchor = canvasElement.querySelector('a')!;

    await expect(anchor).not.toHaveAttribute('href');
    await expect(anchor).toHaveAttribute('aria-disabled', 'true');
    await expect(canvas.getByText('Loading...')).toBeInTheDocument();
  }
};
