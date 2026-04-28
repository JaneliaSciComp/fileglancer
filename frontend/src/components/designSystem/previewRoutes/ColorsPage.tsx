/**
 * Design System Colors Reference Page
 *
 * Displays all design colors from the tailwind.config.js theme configuration.
 *
 * Color hex values are hard-coded here since tailwind.config.js is a build-time
 * config file and cannot be imported at runtime. Keep these in sync with
 * frontend/tailwind.config.js (mtConfig plugin).
 */

// ---------- Color data (derived from tailwind.config.js) ----------

interface ColorVariants {
  default: string;
  dark: string;
  light: string;
  foreground: string;
}

interface ColorGroup {
  name: string;
  variants: ColorVariants;
}

interface SimpleColor {
  name: string;
  hex: string;
}

interface ModeColors {
  simpleColors: SimpleColor[];
  colorGroups: ColorGroup[];
}

export const lightModeColors: ModeColors = {
  simpleColors: [
    { name: 'background', hex: '#FFFFFF' },
    { name: 'foreground', hex: '#4B5563' }
  ],
  colorGroups: [
    {
      name: 'primary',
      variants: {
        default: '#058d96',
        dark: '#04767f',
        light: '#36a9b0',
        foreground: '#FFFFFF'
      }
    },
    {
      name: 'secondary',
      variants: {
        default: '#6D28D9',
        dark: '#4C1D95',
        light: '#8B5CF6',
        foreground: '#FFFFFF'
      }
    },
    {
      name: 'surface',
      variants: {
        default: '#E5E7EB',
        dark: '#D1D5DB',
        light: '#F9FAFB',
        foreground: '#1F2937'
      }
    },
    {
      name: 'success',
      variants: {
        default: '#16a34a',
        dark: '#15803d',
        light: '#f0fdf4',
        foreground: '#FFFFFF'
      }
    },
    {
      name: 'info',
      variants: {
        default: '#2563eb',
        dark: '#1d4ed8',
        light: '#eff6ff',
        foreground: '#FFFFFF'
      }
    },
    {
      name: 'warning',
      variants: {
        default: '#d97706',
        dark: '#92400e',
        light: '#fffbeb',
        foreground: '#FFFFFF'
      }
    },
    {
      name: 'error',
      variants: {
        default: '#dc2626',
        dark: '#991b1b',
        light: '#fef2f2',
        foreground: '#FFFFFF'
      }
    }
  ]
};

export const darkModeColors: ModeColors = {
  simpleColors: [
    { name: 'background', hex: '#111827' },
    { name: 'foreground', hex: '#D1D5DB' }
  ],
  colorGroups: [
    {
      name: 'primary',
      variants: {
        default: '#45bcc4',
        dark: '#36a9b0',
        light: '#5cc8cf',
        foreground: '#F3F4F6'
      }
    },
    {
      name: 'secondary',
      variants: {
        default: '#A78BFA',
        dark: '#8B5CF6',
        light: '#DDD6FE',
        foreground: '#F3F4F6'
      }
    },
    {
      name: 'surface',
      variants: {
        default: '#1F2937',
        dark: '#171f2e',
        light: '#374151',
        foreground: '#F3F4F6'
      }
    },
    {
      name: 'success',
      variants: {
        default: '#4ade80',
        dark: '#0a3d1e',
        light: '#86efac',
        foreground: '#F3F4F6'
      }
    },
    {
      name: 'info',
      variants: {
        default: '#60a5fa',
        dark: '#1e3a5f',
        light: '#93c5fd',
        foreground: '#F3F4F6'
      }
    },
    {
      name: 'warning',
      variants: {
        default: '#fbbf24',
        dark: '#5c2d0e',
        light: '#fcd34d',
        foreground: '#F3F4F6'
      }
    },
    {
      name: 'error',
      variants: {
        default: '#f87171',
        dark: '#5c1414',
        light: '#fca5a5',
        foreground: '#F3F4F6'
      }
    }
  ]
};

// ---------- Sub-components ----------

function ColorSwatch({
  hex,
  label
}: {
  readonly hex: string;
  readonly label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="h-12 w-12 rounded border border-surface-dark"
        style={{ backgroundColor: hex }}
      />
      <span className="text-xs text-foreground">{label}</span>
      <span className="font-mono text-xs text-foreground/60">{hex}</span>
    </div>
  );
}

function ColorGroupRow({ group }: { readonly group: ColorGroup }) {
  return (
    <div className="flex items-start gap-6">
      <span className="w-24 shrink-0 pt-3 text-sm font-semibold text-foreground">
        {group.name}
      </span>
      <div className="flex flex-wrap gap-4">
        <ColorSwatch hex={group.variants.default} label="default" />
        <ColorSwatch hex={group.variants.dark} label="dark" />
        <ColorSwatch hex={group.variants.light} label="light" />
        <ColorSwatch hex={group.variants.foreground} label="foreground" />
      </div>
    </div>
  );
}

function ModeSection({
  title,
  colors
}: {
  readonly title: string;
  readonly colors: ModeColors;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>

      {/* Simple colors (background / foreground) */}
      <div className="flex items-start gap-6">
        <span className="w-24 shrink-0 pt-3 text-sm font-semibold text-foreground">
          base
        </span>
        <div className="flex flex-wrap gap-4">
          {colors.simpleColors.map(c => (
            <ColorSwatch hex={c.hex} key={c.name} label={c.name} />
          ))}
        </div>
      </div>

      {/* Grouped colors */}
      {colors.colorGroups.map(group => (
        <ColorGroupRow group={group} key={group.name} />
      ))}
    </div>
  );
}

// ---------- Main page ----------

export default function ColorsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 p-8">
      <h1 className="text-3xl font-bold text-foreground">
        Design System Colors
      </h1>

      {/* Colors */}
      <section className="space-y-6">
        <ModeSection colors={lightModeColors} title="Light Mode" />
        <ModeSection colors={darkModeColors} title="Dark Mode" />
      </section>
    </div>
  );
}
