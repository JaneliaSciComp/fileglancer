# CLAUDE.md - Frontend

> **Note**: This is a subdirectory-specific guide. For full project context, look for a CLAUDE.md in the root directory.

## Development Patterns

### Import Formatting

Use separate import lines for values and types from the same package (e.g. `import { useQuery } from '...'` and `import type { UseQueryResult } from '...'` on separate lines).

### URL Construction and Encoding

Never manually construct URLs with template strings. Use utility functions (`src/utils/index.ts`, `src/utils/pathHandling.ts`):

1. **`buildUrl`** (`src/utils/index.ts`) - General-purpose URL builder with two overloads:

   - **Overload 1**: `buildUrl(baseUrl, singlePathSegment | null, queryParams | null)` — single path segment encoded with `encodeURIComponent`, plus optional query params via `URLSearchParams`
     ```typescript
     buildUrl('/api/files/', 'myFSP', { subpath: 'folder/file.txt' })
     // → '/api/files/myFSP?subpath=folder%2Ffile.txt'
     buildUrl('/api/endpoint', null, { key: 'value' })
     // → '/api/endpoint?key=value'
     ```
   - **Overload 2**: `buildUrl(baseUrl, multiSegmentPathString)` — multi-segment path encoded with `escapePathForUrl` (preserves `/`)
     ```typescript
     buildUrl('https://s3.example.com/bucket', 'folder/file 100%.zarr')
     // → 'https://s3.example.com/bucket/folder/file%20100%25.zarr'
     ```
   - **Use for**: All internal API calls and any external URL that needs path or query encoding

2. **`getFileURL(fspName, filePath?)`** - Absolute `/api/content/` URL for file content; use when passing URLs to OME-Zarr viewers

3. **`escapePathForUrl(path)`** - Encodes path segments while preserving `/`; use when `buildUrl` overload 2 isn't sufficient

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
9. **React imports**: Use named imports, not namespace imports (e.g., `import { useState } from 'react'`, not `import React from 'react'`)
10. **Component return types**: Do not specify return types for React component functions unless absolutely necessary
    - Good: `function MyComponent() { ... }`
    - Avoid: `function MyComponent(): JSX.Element { ... }`

### API Integration with TanStack Query

**URL construction:** Use `buildUrl` from `@/utils` for all API URLs:
- `buildUrl('/api/files/', fspName, { subpath: path })` — path segment + query params
- `buildUrl('/api/resource/', id, null)` — path segment only

**Query utilities** (`src/queries/queryUtils.ts`):
- `sendRequestAndThrowForNotOk(url, method, body?)` — sends request, throws on non-2xx; use for most mutations
- `getResponseJsonOrError(response)` + `throwResponseNotOkError(response, body)` — use together when you need custom status-code handling (e.g. treat 404 as empty result, not an error)

**Query key factories:** Define a key factory object alongside each query file for consistent cache management:

```typescript
export const myQueryKeys = {
  all: ['myResource'] as const,
  list: () => ['myResource', 'list'] as const,
  detail: (id: string) => ['myResource', 'detail', id] as const
};
```

**Pattern for data fetching:**

```typescript
// In src/queries/myQueries.ts
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { buildUrl, sendFetchRequest } from '@/utils';
import { getResponseJsonOrError, throwResponseNotOkError } from './queryUtils';

// Extract fetch logic outside the hook for reuse and testability
const fetchMyData = async (
  fspName: string,
  path: string,
  signal?: AbortSignal
): Promise<MyData> => {
  const url = buildUrl('/api/files/', fspName, { subpath: path });
  const response = await sendFetchRequest(url, 'GET', undefined, { signal });
  const body = await getResponseJsonOrError(response);

  if (response.status === 404) {
    return null; // treat 404 as empty, not an error
  }
  if (!response.ok) {
    throwResponseNotOkError(response, body);
  }
  return body as MyData;
};

export function useMyDataQuery(
  fspName: string | undefined,
  path: string | undefined
): UseQueryResult<MyData, Error> {
  return useQuery<MyData, Error>({
    queryKey: myQueryKeys.detail(fspName ?? '', path ?? ''),
    queryFn: ({ signal }) => fetchMyData(fspName!, path!, signal),
    enabled: !!fspName && !!path,
    staleTime: 5 * 60 * 1000, // override default only when there's a good reason
    retry: false // omit to use the default; set false when retrying won't help
  });
}
```

**Mutations** use `useMutation` + `sendRequestAndThrowForNotOk`. Use `onMutate`/`onError` for optimistic updates with rollback, and `onSuccess` to call `queryClient.invalidateQueries` or `setQueryData`. See `proxiedPathQueries.ts` for a full example.

### Error Handling

- Either handle error or throw. Do not log and then throw.

For backend development, database migrations, or full-stack workflows, look for a CLAUDE.md in the root directory.
