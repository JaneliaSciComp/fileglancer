import { useState } from 'react';
import { Link } from 'react-router';
import { HiDownload, HiHome, HiOutlinePlus, HiSearch } from 'react-icons/hi';

import FgBadge from '@/components/designSystem/atoms/FgBadge';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgExternalLink from '@/components/designSystem/atoms/FgExternalLink';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgLink from '@/components/designSystem/atoms/FgLink';

const emptyCategories = ['Molecules', 'Organisms', 'Templates'];

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
