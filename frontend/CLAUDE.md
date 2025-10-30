# CLAUDE.md - Frontend

This file provides guidance to Claude Code when working with the frontend code in this directory.

> **Note**: This is a subdirectory-specific guide. For full project context, see [../CLAUDE.md](../CLAUDE.md) in the root directory.

## Directory Overview

This directory contains the React/TypeScript frontend application for Fileglancer. The built output is copied to `../fileglancer/ui/` and served by the FastAPI backend.

## Quick Start

```bash
# From project root
cd ..
pixi run dev-install          # Install and build
pixi run dev-watch            # Watch mode for frontend changes
pixi run dev-launch           # Launch backend + serve frontend
pixi run test-frontend        # Vitest frontend unit tests (npm test)
pixi run test-ui              # Playwright integration tests
pixi run test-ui -- tests/specific.spec.ts  # Run specific test
pixi run node-eslint-check    # Check eslint rules
pixi run node-eslint-write    # Modify according to eslint rules
pixi run node-prettier-write  # Modify according to prettier rules
./clean.sh                    # Clean all build directories
```

## Directory Structure

```
frontend/
├── src/
│   ├── main.tsx              # Application entry point
│   ├── App.tsx               # Root component with routing
│   ├── index.css             # Global styles
│   ├── logger.ts             # Logging utility (loglevel)
│   ├── omezarr-helper.ts     # OME-Zarr/NGFF utilities
│   ├── shared.types.ts       # Shared TypeScript types
│   │
│   ├── components/           # Page-level components
│   │   ├── Browse.tsx
│   │   ├── Help.tsx
│   │   ├── Jobs.tsx
│   │   ├── Links.tsx
│   │   ├── Preferences.tsx
│   │   ├── Notifications.tsx
│   │   └── ui/              # Feature-specific UI components
│   │       ├── BrowsePage/  # File browser components
│   │       ├── Dialogs/     # Modal dialogs
│   │       ├── Menus/       # Context and action menus
│   │       ├── Navbar/      # Top navigation
│   │       ├── Sidebar/     # File browser sidebar
│   │       ├── Table/       # Table components
│   │       ├── widgets/     # Reusable UI widgets
│   │       ├── PreferencesPage/
│   │       ├── PropertiesDrawer/
│   │       └── Notifications/
│   │
│   ├── contexts/            # React Context providers
│   │   ├── FileBrowserContext.tsx
│   │   ├── ZonesAndFspMapContext.tsx
│   │   ├── PreferencesContext.tsx
│   │   ├── TicketsContext.tsx
│   │   ├── ProxiedPathContext.tsx
│   │   ├── ExternalBucketContext.tsx
│   │   ├── ProfileContext.tsx
│   │   ├── ServerHealthContext.tsx
│   │   ├── NotificationsContext.tsx
│   │   ├── OpenFavoritesContext.tsx
│   │   └── CookiesContext.tsx
│   │
│   ├── hooks/               # Custom React hooks
│   │
│   ├── queries/             # TanStack Query hooks
│   │   └── (API query hooks)
│   │
│   ├── layouts/             # Layout components
│   │   ├── MainLayout.tsx
│   │   ├── BrowsePageLayout.tsx
│   │   └── OtherPagesLayout.tsx
│   │
│   ├── utils/               # Utility functions
│   │
│   ├── constants/           # Application constants
│   │
│   ├── assets/              # Static assets (images, icons)
│   │
│   └── __tests__/           # Test files
│       ├── setup.ts
│       ├── test-utils.tsx
│       ├── componentTests/
│       ├── unitTests/
│       └── mocks/
│           └── handlers.ts  # MSW mock handlers
│
├── ui-tests/                # Playwright E2E tests
├── public/                  # Static public assets
├── index.html               # HTML entry point
├── vite.config.ts           # Vite configuration
├── tailwind.config.js       # Tailwind CSS theme
├── eslint.config.mjs        # ESLint configuration
├── prettier.config.mjs      # Prettier configuration
├── tsconfig.json            # TypeScript configuration
└── package.json             # NPM dependencies and scripts
```

## Technology Stack

### Core

- **React 18.3** - UI framework with hooks and concurrent features
- **TypeScript 5.8** - Type-safe JavaScript
- **Vite** (Rolldown) - Fast Rust-based bundler (Rollup alternative)
- **React Router 7.4** - Client-side routing

### State Management

- **React Context API** - Application state (see `src/contexts/`)
- **TanStack Query v5** - Server state management, data fetching, caching
  - Query hooks in `src/queries/`
  - DevTools available in development mode

### UI & Styling

- **Material Tailwind v3** (beta) - Component library
- **Tailwind CSS 3.4** - Utility-first CSS framework
- **React Icons 5.5** - Icon library
- **React Hot Toast 2.5** - Notifications/toasts
- **React Resizable Panels 3.0** - Resizable layout panels

### Data & Visualization

- **TanStack Table v8** - Headless table/data grid
- **ome-zarr.js 0.0.14** - OME-NGFF/Zarr visualization
- **zarrita 0.5** - Zarr file format support
- **React Syntax Highlighter 15.6** - Code display

### Testing

- **Vitest 3.1** - Fast unit test runner (Vite-native)
- **React Testing Library 16.3** - Component testing utilities
- **Happy DOM 18.0** - Fast DOM implementation for tests
- **MSW 2.10** - API mocking for tests
- **@testing-library/jest-dom 6.6** - DOM matchers
- **@testing-library/user-event 14.6** - User interaction simulation
- **Playwright** (in ui-tests/) - E2E browser testing

### Development Tools

- **ESLint 9.26** - Linting with TypeScript/React plugins
- **Prettier 3.5** - Code formatting
- **Lefthook 1.12** - Git hooks manager

## Development Patterns

### Component Guidelines

**Preferences when adding a new UI component:**

1. **Use existing components first**: Check Material Tailwind v3 components before creating new ones
2. **Reuse app components**: Look in `src/components/ui/` for existing patterns to refactor/extend
3. **Create new only as last resort**: When neither Material Tailwind nor existing components suffice
4. **Use existing utilities**: Check `src/utils/` before writing new utility functions
5. **Follow color system**: Use colors from `tailwind.config.js` (mtConfig plugin)
   - When using "default" color, omit 'default' from class name
   - Don't expand color definitions
6. **Use logger**: Import from `src/logger.ts` - never use `console.log()`
7. **TypeScript interfaces**: Always define props interfaces for components
8. **File naming**: PascalCase for components (e.g., `MyComponent.tsx`)

### State Management Patterns

**When to use what:**

- **React Context** (`src/contexts/`) - Global UI state, dependency injection (e.g., of server state)
  - Follow provider pattern used in existing contexts
- **TanStack Query** (`src/queries/`) - Server data fetching, caching, synchronization
  - Use for all API calls
  - Define query/mutation hooks in `src/queries/`
  - Leverage automatic refetching, caching, and background updates
- **Component State** (`useState`) - Local UI state that doesn't need to be shared
- **URL State** (React Router) - Navigation state, filters, search params

### API Integration with TanStack Query

**Pattern for data fetching:**

```typescript
// In src/queries/useMyData.ts
// default `staleTime` set to 30 seconds in /src/main.tsx
// only override if good reason to (see example below)
import { useQuery } from '@tanstack/react-query';

export function useMyData(id: string) {
  return useQuery({
    queryKey: ['my-data', id],
    queryFn: async () => {
      const response = await fetch(`/api/my-endpoint/${id}`);
      if (!response.ok) throw new Error('Failed to fetch');
      return response.json();
    },
    staleTime: 1000 * 60 * 5 // 5 minutes, data not expected to change frequently
  });
}

// In component
const { data, isLoading, error } = useMyData(id);
```

**Pattern for mutations:**

```typescript
// In src/queries/useUpdateMyData.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useUpdateMyData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: MyData) => {
      const response = await fetch('/api/my-endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Update failed');
      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['my-data'] });
    }
  });
}
```

### Routing

- **Base path**: `/fg/` (configured in `vite.config.ts`)
- **Routes**:
  - `/fg/` - Dashboard/Browse (default)
  - `/fg/browse` - File browser
  - `/fg/jobs` - Background jobs
  - `/fg/links` - Data links management
  - `/fg/help` - Help/support
  - `/fg/preferences` - User preferences
  - `/fg/notifications` - Notifications
- **Route definitions**: See `src/App.tsx`
- **Navigation**: Use React Router's `useNavigate()`, `Link`, or `NavLink`

### Error Handling

- **React Error Boundary**: Wraps app to catch React errors
- **TanStack Query**: Built-in error handling for async operations
  - Check `error` property from `useQuery`/`useMutation`
- **Toast notifications**: Use `react-hot-toast` for user-facing errors
- **Logging**: Use `logger` from `src/logger.ts` for debugging. Leave minimal loggers in final version of code

### Testing Strategy

**Unit Tests** (`src/__tests__/`)

- **Setup**: `setup.ts` configures test environment (Happy DOM, React Testing Library)
- **Test utilities**: `test-utils.tsx` provides custom render functions with providers
- **API mocking**: MSW handlers in `mocks/handlers.ts`
- **Component tests**: `componentTests/` - test UI components in isolation
- **Unit tests**: `unitTests/` - test utility functions, helpers, hooks
- **Coverage**: Run with `npm test -- --coverage`

**E2E Tests** (`ui-tests/`)

- **Playwright** browser tests for full application flows
- Run from project root with `pixi run test-ui`

**Testing best practices:**

- Mock API calls with MSW handlers
- Use `screen.getByRole()` over `getByTestId()`
- Test user interactions, not implementation details
- Keep tests isolated and independent

## Common Workflows

### Adding a New Feature

1. **Plan the feature** - Identify components, contexts, API calls needed
2. **Check for existing patterns** - Look for similar features to reuse/adapt
3. **Create components** - In appropriate `src/components/ui/` subdirectory
4. **Add state management** - Context for UI state and dependency injection, TanStack Query for server data
5. **Define types** - TypeScript interfaces in component files or `shared.types.ts`
6. **Add API integration** - Query/mutation hooks in `src/queries/`
7. **Update routing** - If needed, add route in `src/App.tsx`
8. **Add tests** - Unit tests in `__tests__/`, E2E tests in `ui-tests/`
9. **Update docs** - Document new patterns or conventions

### Modifying Existing Components

1. **Read the component** - Understand current implementation
2. **Check dependencies** - See what contexts/hooks it uses
3. **Update types** - Modify TypeScript interfaces as needed
4. **Make changes** - Follow existing patterns and conventions
5. **Update tests** - Ensure existing tests work with new behavior

### Debugging

**Development tools:**

- **React DevTools** - Browser extension for component inspection
- **TanStack Query DevTools** - Automatically available in dev mode (bottom-left icon)
- **Browser DevTools** - Console, Network tab, React tab
- **Vite HMR** - Hot Module Replacement for fast feedback

**Common issues:**

- **Build errors**: Check TypeScript types, import paths
- **Runtime errors**: Check browser console, React Error Boundary
- **API errors**: Check TanStack Query DevTools, Network tab
- **State issues**: Check React Context providers, TanStack Query cache
- **Style issues**: Check Tailwind classes, `tailwind.config.js`

### Working with Backend

**API base URL:**

- Development: `http://localhost:7878` (FastAPI backend)
- Production: Same origin as frontend (served by FastAPI)

**API endpoints:** All under `/api/` prefix

- `/api/files` - File operations
- `/api/proxied-paths` - Data links
- `/api/tickets` - Background jobs
- `/api/external-buckets` - S3 buckets
- `/api/file-share-paths` - File shares
- `/api/profile` - User profile
- `/api/health` - Backend health check

**API integration:**

- Use TanStack Query hooks in `src/queries/`
- Define query keys consistently for cache management
- Handle loading, error, and success states

## Import Aliases

- `@/` - Resolves to `./src/` (configured in `vite.config.ts` and `tsconfig.json`)
- Example: `import { logger } from '@/logger'`

## Build Output

- **Development build**: Outputs to `../fileglancer/ui/`
- **Served by**: FastAPI backend at `/fg/` path
- **Static assets**: `/fg/assets/` (Vite asset hashing applied)

## Environment Variables

- `.env` - Local environment configuration
- Variables must be prefixed with `VITE_` to be exposed to frontend
- Access via `import.meta.env.VITE_VAR_NAME`

## Troubleshooting

**Build issues:**

- Clear cache: `rm -rf node_modules .eslintcache && npm install` or use `./clean.sh` from the root directory
- Check Node version: Should be v22.12+
- Verify output directory: `../fileglancer/ui/` should exist after build

**Import errors:**

- Check import paths and file extensions (.tsx, .ts)
- Verify `@/` alias resolves correctly
- Check `tsconfig.json` paths configuration

**Type errors:**

- Run `pixi run node-eslint-check` to see all type errors
- Check TypeScript version matches project (5.8+)
- Verify all dependencies have type definitions

**Vite/Rolldown issues:**

- Check `vite.config.ts` for plugin configuration
- Clear Vite cache: `rm -rf node_modules/.vite`
- Note: Using Rolldown (Rust alternative to Rollup) via `rolldown-vite` package

**Test failures:**

- Check MSW handlers are properly configured
- Verify test setup in `src/__tests__/setup.ts`

**TanStack Query issues:**

- Check query keys are unique and consistent
- Use TanStack Query DevTools to inspect cache
- Verify `queryClient` configuration in `src/main.tsx`

## Additional Resources

- [React 18 Docs](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Guide](https://vite.dev/guide/)
- [React Router Docs](https://reactrouter.com)
- [TanStack Query Docs](https://tanstack.com/query/latest/docs/react/overview)
- [Material Tailwind Docs](https://www.material-tailwind.com)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Vitest Docs](https://vitest.dev)
- [React Testing Library Docs](https://testing-library.com/react)
- [MSW Docs](https://mswjs.io)

---

For backend development, database migrations, or full-stack workflows, see [../CLAUDE.md](../CLAUDE.md) in the root directory.
