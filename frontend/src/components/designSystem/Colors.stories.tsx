import type { Meta, StoryObj } from '@storybook/react-vite';

// ---------- Color definitions ----------

/**
 * Full Tailwind class names written out so the compiler can detect them.
 * Dynamic string interpolation (e.g. `bg-${name}`) would be purged.
 */
export const colorGroups: Record<string, Record<string, string>> = {
  primary: {
    default: 'bg-primary',
    dark: 'bg-primary-dark',
    light: 'bg-primary-light',
    foreground: 'bg-primary-foreground'
  },
  secondary: {
    default: 'bg-secondary',
    dark: 'bg-secondary-dark',
    light: 'bg-secondary-light',
    foreground: 'bg-secondary-foreground'
  },
  surface: {
    default: 'bg-surface',
    dark: 'bg-surface-dark',
    light: 'bg-surface-light',
    foreground: 'bg-surface-foreground'
  },
  success: {
    default: 'bg-success',
    dark: 'bg-success-dark',
    light: 'bg-success-light',
    foreground: 'bg-success-foreground'
  },
  info: {
    default: 'bg-info',
    dark: 'bg-info-dark',
    light: 'bg-info-light',
    foreground: 'bg-info-foreground'
  },
  warning: {
    default: 'bg-warning',
    dark: 'bg-warning-dark',
    light: 'bg-warning-light',
    foreground: 'bg-warning-foreground'
  },
  error: {
    default: 'bg-error',
    dark: 'bg-error-dark',
    light: 'bg-error-light',
    foreground: 'bg-error-foreground'
  }
};

// ---------- Sub-components ----------

function ColorSwatch({
  className,
  label
}: {
  readonly className: string;
  readonly label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`h-12 w-12 rounded border border-surface-dark ${className}`}
      />
      <span className="text-xs text-foreground">{label}</span>
    </div>
  );
}

function ColorGroupRow({
  name,
  variants
}: {
  readonly name: string;
  readonly variants: Record<string, string>;
}) {
  return (
    <div className="flex items-start gap-6">
      <span className="w-24 shrink-0 pt-3 text-sm font-semibold text-foreground">
        {name}
      </span>
      <div className="flex flex-wrap gap-4">
        {Object.entries(variants).map(([variant, className]) => (
          <ColorSwatch className={className} key={variant} label={variant} />
        ))}
      </div>
    </div>
  );
}

// ---------- Storybook meta ----------

const meta = {
  title: 'Design System/Colors',
  parameters: {
    controls: { disable: true }
  },
  excludeStories: ['colorGroups']
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Colors: Story = {
  render: () => (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <h1 className="text-2xl font-bold text-foreground ">Colors</h1>

      {/* Simple colors */}
      <div className="flex items-start gap-6">
        <span className="w-24 shrink-0 pt-3 text-sm font-semibold text-foreground ">
          base
        </span>
        <div className="flex flex-wrap gap-4">
          <ColorSwatch className="bg-background" label="background" />
          <ColorSwatch className="bg-foreground" label="foreground" />
        </div>
      </div>

      {/* Grouped colors */}
      {Object.entries(colorGroups).map(([name, variants]) => (
        <ColorGroupRow key={name} name={name} variants={variants} />
      ))}
    </div>
  )
};
