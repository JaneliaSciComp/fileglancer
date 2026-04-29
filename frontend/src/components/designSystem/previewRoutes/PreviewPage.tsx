import { useState } from 'react';
import { Link } from 'react-router';
import { HiDownload, HiHome, HiOutlinePlus, HiSearch } from 'react-icons/hi';

import FgBadge from '@/components/designSystem/atoms/FgBadge';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgCheckbox from '@/components/designSystem/atoms/formElements/FgCheckbox';
import FgExternalLink from '@/components/designSystem/atoms/FgExternalLink';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import FgLink from '@/components/designSystem/atoms/FgLink';
import FgRadio from '@/components/designSystem/atoms/formElements/FgRadio';
import FgSelect from '@/components/designSystem/atoms/formElements/FgSelect';
import FgSwitch from '@/components/designSystem/atoms/formElements/FgSwitch';
import FgTextarea from '@/components/designSystem/atoms/formElements/FgTextarea';
import FgFieldSet from '@/components/designSystem/molecules/FgFieldSet';
import FgFormField from '@/components/designSystem/molecules/FgFormField';

const emptyCategories = ['Organisms', 'Templates'];

function SectionLabel({ children }: { readonly children: string }) {
  return <p className="text-sm font-medium text-foreground/70">{children}</p>;
}

function Row({ children }: { readonly children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function PreviewCard({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-lg border border-surface-dark p-4">
      {children}
    </div>
  );
}

function IconPreview() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">FgIcon</h3>
      <PreviewCard>
        <SectionLabel>Sizes</SectionLabel>
        <Row>
          <FgIcon icon={HiHome} label="Home xs" size="xs" />
          <FgIcon icon={HiHome} label="Home sm" size="sm" />
          <FgIcon icon={HiHome} label="Home md" size="md" />
          <FgIcon icon={HiHome} label="Home lg" size="lg" />
        </Row>
      </PreviewCard>
    </div>
  );
}

function ButtonPreview() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">FgButton</h3>
      <PreviewCard>
        <SectionLabel>Variants</SectionLabel>
        <Row>
          <FgButton variant="solid">Solid</FgButton>
          <FgButton variant="outline">Outline</FgButton>
          <FgButton variant="ghost">Ghost</FgButton>
          <FgButton variant="link">Link</FgButton>
        </Row>

        <SectionLabel>Link variant with icon</SectionLabel>
        <Row>
          <FgButton icon={HiOutlinePlus} size="sm" variant="link">
            Add variable
          </FgButton>
        </Row>

        <SectionLabel>Colors</SectionLabel>
        <Row>
          <FgButton color="primary">Primary</FgButton>
          <FgButton color="secondary">Secondary</FgButton>
          <FgButton color="error">Error</FgButton>
          <FgButton color="success">Success</FgButton>
          <FgButton color="warning">Warning</FgButton>
          <FgButton color="info">Info</FgButton>
        </Row>

        <SectionLabel>Loading state</SectionLabel>
        <Row>
          <FgButton loading loadingText="Saving...">
            Save
          </FgButton>
        </Row>

        <SectionLabel>With icon</SectionLabel>
        <Row>
          <FgButton icon={HiDownload} iconPosition="left">
            Download
          </FgButton>
          <FgButton icon={HiSearch} iconPosition="right">
            Search
          </FgButton>
        </Row>

        <SectionLabel>Disabled</SectionLabel>
        <Row>
          <FgButton disabled>Disabled</FgButton>
        </Row>
      </PreviewCard>
    </div>
  );
}

function BadgePreview() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">FgBadge</h3>
      <PreviewCard>
        <SectionLabel>Color palette</SectionLabel>
        <Row>
          <FgBadge color="primary">Primary</FgBadge>
          <FgBadge color="secondary">Secondary</FgBadge>
          <FgBadge color="success">Success</FgBadge>
          <FgBadge color="error">Error</FgBadge>
          <FgBadge color="warning">Warning</FgBadge>
          <FgBadge color="info">Info</FgBadge>
          <FgBadge color="neutral">Neutral</FgBadge>
        </Row>

        <SectionLabel>Variants</SectionLabel>
        <Row>
          <FgBadge variant="default">Default</FgBadge>
          <FgBadge variant="pill">Pill</FgBadge>
        </Row>

        <SectionLabel>With dot indicator</SectionLabel>
        <Row>
          <FgBadge color="success" dot>
            Active
          </FgBadge>
          <FgBadge color="error" dot>
            Offline
          </FgBadge>
          <FgBadge color="warning" dot variant="pill">
            Pending
          </FgBadge>
        </Row>
      </PreviewCard>
    </div>
  );
}

function LinkPreview() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">FgLink</h3>
      <PreviewCard>
        <SectionLabel>Sizes</SectionLabel>
        <Row>
          <FgLink size="sm" to="/design-system">
            Small link
          </FgLink>
          <FgLink size="md" to="/design-system">
            Medium link
          </FgLink>
          <FgLink size="lg" to="/design-system">
            Large link
          </FgLink>
        </Row>
      </PreviewCard>
    </div>
  );
}

function ExternalLinkPreview() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">FgExternalLink</h3>
      <PreviewCard>
        <SectionLabel>With and without icon</SectionLabel>
        <Row>
          <FgExternalLink href="https://example.com">With icon</FgExternalLink>
          <FgExternalLink href="https://example.com" showIcon={false}>
            Without icon
          </FgExternalLink>
        </Row>

        <SectionLabel>Sizes</SectionLabel>
        <Row>
          <FgExternalLink href="https://example.com" size="sm">
            Small
          </FgExternalLink>
          <FgExternalLink href="https://example.com" size="md">
            Medium
          </FgExternalLink>
          <FgExternalLink href="https://example.com" size="lg">
            Large
          </FgExternalLink>
        </Row>
      </PreviewCard>
    </div>
  );
}

function InputPreview() {
  const [value, setValue] = useState('');

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">FgInput</h3>
      <PreviewCard>
        <SectionLabel>Sizes</SectionLabel>
        <Row>
          <FgInput placeholder="Small" size="sm" />
          <FgInput placeholder="Medium" size="md" />
          <FgInput placeholder="Large" size="lg" />
        </Row>

        <SectionLabel>Interactive</SectionLabel>
        <FgInput
          onChange={e => setValue(e.target.value)}
          placeholder="Type something..."
          value={value}
        />

        <SectionLabel>Error state</SectionLabel>
        <FgInput error placeholder="Invalid input" />

        <SectionLabel>Disabled</SectionLabel>
        <FgInput disabled placeholder="Disabled input" />
      </PreviewCard>
    </div>
  );
}

function TextareaPreview() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">FgTextarea</h3>
      <PreviewCard>
        <SectionLabel>Default</SectionLabel>
        <FgTextarea placeholder="Enter a description..." rows={3} />

        <SectionLabel>Error state</SectionLabel>
        <FgTextarea error placeholder="Invalid content" rows={3} />
      </PreviewCard>
    </div>
  );
}

function SelectPreview() {
  const [value, setValue] = useState('');

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">FgSelect</h3>
      <PreviewCard>
        <SectionLabel>Default</SectionLabel>
        <FgSelect onChange={e => setValue(e.target.value)} value={value}>
          <option value="">Select an option...</option>
          <option value="apple">Apple</option>
          <option value="banana">Banana</option>
          <option value="cherry">Cherry</option>
        </FgSelect>

        <SectionLabel>Error state</SectionLabel>
        <FgSelect defaultValue="" error>
          <option value="">Select an option...</option>
          <option value="one">One</option>
          <option value="two">Two</option>
        </FgSelect>
      </PreviewCard>
    </div>
  );
}

function CheckboxPreview() {
  const [checked, setChecked] = useState(false);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">FgCheckbox</h3>
      <PreviewCard>
        <SectionLabel>Primary color</SectionLabel>
        <Row>
          <FgCheckbox
            checked={checked}
            color="primary"
            label="Accept terms"
            onChange={() => setChecked(!checked)}
          />
        </Row>

        <SectionLabel>Secondary color</SectionLabel>
        <Row>
          <FgCheckbox color="secondary" defaultChecked label="Notify me" />
        </Row>

        <SectionLabel>Checked</SectionLabel>
        <Row>
          <FgCheckbox checked label="Already checked" readOnly />
        </Row>

        <SectionLabel>Disabled</SectionLabel>
        <Row>
          <FgCheckbox disabled label="Cannot change" />
        </Row>
      </PreviewCard>
    </div>
  );
}

function RadioPreview() {
  const [selected, setSelected] = useState('option1');

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">FgRadio</h3>
      <PreviewCard>
        <SectionLabel>Secondary color (group)</SectionLabel>
        <div className="space-y-2">
          <FgRadio
            checked={selected === 'option1'}
            color="secondary"
            id="radio-opt1"
            label="Option 1"
            name="demo-group"
            onChange={() => setSelected('option1')}
          />
          <FgRadio
            checked={selected === 'option2'}
            color="secondary"
            id="radio-opt2"
            label="Option 2"
            name="demo-group"
            onChange={() => setSelected('option2')}
          />
          <FgRadio
            checked={selected === 'option3'}
            color="secondary"
            id="radio-opt3"
            label="Option 3"
            name="demo-group"
            onChange={() => setSelected('option3')}
          />
        </div>

        <SectionLabel>Primary color</SectionLabel>
        <Row>
          <FgRadio
            checked
            color="primary"
            id="radio-primary"
            label="Primary radio"
            name="primary-group"
            readOnly
          />
        </Row>
      </PreviewCard>
    </div>
  );
}

function SwitchPreview() {
  const [enabled, setEnabled] = useState(false);
  const [stateDemo, setStateDemo] = useState(true);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">FgSwitch</h3>
      <PreviewCard>
        <SectionLabel>Interactive</SectionLabel>
        <FgSwitch
          checked={enabled}
          id="switch-demo"
          label="Enable feature"
          onChange={() => setEnabled(!enabled)}
        />

        <SectionLabel>With on/off state</SectionLabel>
        <FgSwitch
          checked={stateDemo}
          id="switch-state"
          label="Notifications"
          onChange={() => setStateDemo(!stateDemo)}
          showState
        />

        <SectionLabel>Disabled</SectionLabel>
        <FgSwitch
          checked={false}
          disabled
          id="switch-disabled"
          label="Disabled switch"
          onChange={() => {}}
        />
      </PreviewCard>
    </div>
  );
}

function FieldSetPreview() {
  const [pathFormat, setPathFormat] = useState('linux');
  const [mode, setMode] = useState('url');

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">FgFieldSet</h3>
      <PreviewCard>
        <SectionLabel>Vertical radio group</SectionLabel>
        <FgFieldSet legend="File path format">
          <div className="mt-1 space-y-2">
            <FgRadio
              checked={pathFormat === 'linux'}
              color="secondary"
              id="fs-linux"
              label="Linux"
              name="fs-path-format"
              onChange={() => setPathFormat('linux')}
            />
            <FgRadio
              checked={pathFormat === 'windows'}
              color="secondary"
              id="fs-windows"
              label="Windows"
              name="fs-path-format"
              onChange={() => setPathFormat('windows')}
            />
            <FgRadio
              checked={pathFormat === 'mac'}
              color="secondary"
              id="fs-mac"
              label="macOS"
              name="fs-path-format"
              onChange={() => setPathFormat('mac')}
            />
          </div>
        </FgFieldSet>

        <SectionLabel>Inline radio group</SectionLabel>
        <FgFieldSet inline legend="Input mode">
          <FgRadio
            checked={mode === 'url'}
            id="fs-mode-url"
            label="URL"
            name="fs-mode"
            onChange={() => setMode('url')}
          />
          <FgRadio
            checked={mode === 'state'}
            id="fs-mode-state"
            label="State"
            name="fs-mode"
            onChange={() => setMode('state')}
          />
        </FgFieldSet>

        <SectionLabel>Checkbox group</SectionLabel>
        <FgFieldSet legend="Display options">
          <div className="mt-1 space-y-2">
            <FgCheckbox
              color="secondary"
              defaultChecked
              label="Hide dot files"
            />
            <FgCheckbox color="secondary" label="Show tutorial" />
          </div>
        </FgFieldSet>
      </PreviewCard>
    </div>
  );
}

function FormFieldPreview() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">FgFormField</h3>
      <PreviewCard>
        <SectionLabel>With label</SectionLabel>
        <FgFormField htmlFor="ff-basic" label="Username">
          <FgInput id="ff-basic" placeholder="Enter username" />
        </FgFormField>

        <SectionLabel>Default (required assumed)</SectionLabel>
        <FgFormField htmlFor="ff-required" label="Email">
          <FgInput id="ff-required" placeholder="you@example.com" />
        </FgFormField>

        <SectionLabel>Optional</SectionLabel>
        <FgFormField htmlFor="ff-optional" label="Nickname" optional>
          <FgInput id="ff-optional" placeholder="Optional nickname" />
        </FgFormField>

        <SectionLabel>With error message</SectionLabel>
        <FgFormField
          error="This field is required"
          htmlFor="ff-error"
          label="Password"
        >
          <FgInput error id="ff-error" placeholder="Enter password" />
        </FgFormField>

        <SectionLabel>With helper text</SectionLabel>
        <FgFormField
          helperText="Must be at least 8 characters"
          htmlFor="ff-helper"
          label="Password"
        >
          <FgInput
            id="ff-helper"
            placeholder="Enter password"
            type="password"
          />
        </FgFormField>
      </PreviewCard>
    </div>
  );
}

export default function PreviewPage() {
  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains('dark')
  );

  function toggleDarkMode() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">
          Design System Preview
        </h1>
        <button
          className="rounded-md bg-surface px-4 py-2 text-sm font-medium text-surface-foreground hover:bg-surface-dark"
          onClick={toggleDarkMode}
          type="button"
        >
          {isDark ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>

      {/* Links */}
      <div>
        <Link
          className="text-primary underline hover:text-primary-dark"
          to="/design-system/colors"
        >
          View Colors Reference
        </Link>
      </div>

      {/* Atoms */}
      <section>
        <h2 className="border-b border-surface-dark pb-2 text-xl font-semibold text-foreground">
          Atoms
        </h2>
        <div className="mt-4 space-y-8">
          <IconPreview />
          <ButtonPreview />
          <BadgePreview />
          <LinkPreview />
          <ExternalLinkPreview />
          <InputPreview />
          <TextareaPreview />
          <SelectPreview />
          <CheckboxPreview />
          <RadioPreview />
          <SwitchPreview />
        </div>
      </section>

      {/* Molecules */}
      <section>
        <h2 className="border-b border-surface-dark pb-2 text-xl font-semibold text-foreground">
          Molecules
        </h2>
        <div className="mt-4 space-y-8">
          <FormFieldPreview />
          <FieldSetPreview />
        </div>
      </section>

      {/* Empty categories */}
      {emptyCategories.map(category => (
        <section key={category}>
          <h2 className="border-b border-surface-dark pb-2 text-xl font-semibold text-foreground">
            {category}
          </h2>
          <p className="mt-2 text-sm text-foreground/50">No components yet.</p>
        </section>
      ))}
    </div>
  );
}
