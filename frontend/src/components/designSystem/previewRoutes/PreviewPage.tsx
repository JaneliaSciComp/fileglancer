import { useState } from 'react';
import { Link } from 'react-router';

const componentCategories = ['Atoms', 'Molecules', 'Organisms', 'Templates'];

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
