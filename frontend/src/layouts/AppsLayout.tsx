import { NavLink, Outlet, useLocation } from 'react-router';
import type { ReactNode } from 'react';

import FgBadge from '@/components/designSystem/atoms/FgBadge';
import { useActiveJobCount } from '@/hooks/useActiveJobCount';

interface TabItem {
  to: string;
  label: string;
  end?: boolean;
  badge?: ReactNode;
  /** Overrides NavLink's own active-state matching when set. */
  isActive?: boolean;
}

function tabClass({ isActive }: { isActive: boolean }) {
  const base =
    'relative inline-flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary';
  const state = isActive
    ? 'text-primary'
    : 'text-foreground/70 hover:text-foreground';
  return `${base} ${state}`;
}

function TabUnderline({ active }: { readonly active: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute inset-x-0 bottom-0 h-0.5 transition-colors duration-150 ${
        active ? 'bg-primary' : 'bg-transparent'
      }`}
    />
  );
}

export default function AppsLayout() {
  const activeJobCount = useActiveJobCount();
  const { pathname } = useLocation();

  // App detail and launch pages are drill-downs from My Apps, so keep that tab
  // highlighted there (NavLink's own matching would mark it inactive).
  const myAppsActive =
    pathname === '/apps' ||
    pathname.startsWith('/apps/detail/') ||
    pathname.startsWith('/apps/launch/') ||
    pathname.startsWith('/apps/relaunch/');

  const tabs: TabItem[] = [
    { to: '/apps', label: 'My Apps', end: true, isActive: myAppsActive },
    { to: '/apps/catalog', label: 'App Catalog' },
    {
      to: '/apps/jobs',
      label: 'Jobs',
      badge:
        activeJobCount > 0 ? (
          <FgBadge color="secondary" size="sm" variant="pill">
            {activeJobCount > 9 ? '9+' : activeJobCount}
          </FgBadge>
        ) : null
    }
  ];

  return (
    <div>
      <nav
        aria-label="Apps sections"
        className="mb-6 border-b border-surface-light dark:border-surface"
      >
        <ul className="flex gap-1 -mb-px">
          {tabs.map(tab => (
            <li key={tab.to}>
              <NavLink
                className={({ isActive }) =>
                  tabClass({ isActive: tab.isActive ?? isActive })
                }
                end={tab.end}
                to={tab.to}
              >
                {({ isActive }) => (
                  <>
                    <span>{tab.label}</span>
                    {tab.badge}
                    <TabUnderline active={tab.isActive ?? isActive} />
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
