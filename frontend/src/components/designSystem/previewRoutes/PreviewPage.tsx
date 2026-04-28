import { useState } from 'react';
import { Link } from 'react-router';
import { HiDownload, HiHome, HiOutlinePlus, HiSearch } from 'react-icons/hi';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
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

      {/* Empty state */}
      <p className="text-foreground/60">
        Components will appear here as batches are built.
      </p>

      {/* Planned categories */}
      <div className="space-y-6">
        {componentCategories.map(category => (
          <section key={category}>
            <h2 className="border-b border-surface-dark pb-2 text-xl font-semibold text-foreground">
              {category}
            </h2>
            <p className="mt-2 text-sm text-foreground/50">
              No components yet.
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
