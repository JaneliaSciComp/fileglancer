//https://mswjs.io/docs/quick-start

import { http, HttpResponse } from 'msw';

export const handlers = [
  // Proxied paths
  http.get('/api/proxied-path', ({ request }) => {
    const url = new URL(request.url);
    const fspName = url.searchParams.get('fsp_name');
    const path = url.searchParams.get('path');

    // If query params are provided, simulate no existing proxied path (for fetchProxiedPath)
    if (fspName && path) {
      return HttpResponse.json({ paths: [] }, { status: 200 });
    }

    // Default case for fetching all proxied paths
    return HttpResponse.json({ paths: [] }, { status: 200 });
  }),

  http.post('/api/proxied-path', () => {
    return HttpResponse.json({
      username: 'testuser',
      sharing_key: 'testkey',
      sharing_name: 'testshare',
      path: '/test/path',
      fsp_name: 'test_fsp',
      created_at: '2025-07-08T15:56:42.588942',
      updated_at: '2025-07-08T15:56:42.588942',
      url: 'http://127.0.0.1:7878/files/testkey/test/path'
    });
  }),

  // Preferences - using URL params instead of query params
  // Base preference endpoint (in case it's called without a key)
  http.get('/api/preference/:key', ({ params }) => {
    const { key } = params;
    if (key === 'path') {
      return HttpResponse.json({
        value: ['linux_path']
      });
    } else if (key === 'areDataLinksAutomatic') {
      return HttpResponse.json({
        value: false
      });
    } else if (
      key === 'fileSharePath' ||
      key === 'zone' ||
      key === 'folder' ||
      key === 'recentlyViewedFolders'
    ) {
      return HttpResponse.json({
        value: []
      });
    } else {
      // Fallback for any unhandled preferences
      return HttpResponse.json({
        value: null
      });
    }
  }),
  http.put('/api/preference/:key', ({ params }) => {
    const { key } = params;
    if (key === 'recentlyViewedFolders') {
      return HttpResponse.json(null, { status: 204 });
    }
    // Default success response for other preferences
    return HttpResponse.json(null, { status: 204 });
  }),

  // File share paths
  http.get('/api/file-share-paths', () => {
    return HttpResponse.json({
      paths: [
        {
          name: 'test_fsp',
          zone: 'Zone1',
          group: 'group1',
          storage: 'primary',
          mount_path: '/test/fsp',
          mac_path: 'smb://test/fsp',
          windows_path: '\\\\test\\fsp',
          linux_path: '/test/fsp'
        },
        {
          name: 'another_fsp',
          zone: 'Zone2',
          group: 'group2',
          storage: 'primary',
          mount_path: '/another/path',
          mac_path: 'smb://another/path',
          windows_path: '\\\\another\\path',
          linux_path: '/another/path'
        }
      ]
    });
  }),

  // Files
  http.get('/api/files/:fspName', ({ params, request }) => {
    const url = new URL(request.url);
    const subpath = url.searchParams.get('subpath');
    const { fspName } = params;

    if (fspName === 'test_fsp') {
      return HttpResponse.json({
        info: {
          name: subpath ? subpath.split('/').pop() : '',
          path: subpath || '.',
          size: subpath ? 1024 : 0,
          is_dir: true,
          permissions: 'drwxr-xr-x',
          owner: 'testuser',
          group: 'testgroup',
          last_modified: 1647855213
        },
        files: []
      });
    }
    return HttpResponse.json({ error: 'Not found' }, { status: 404 });
  }),
  // Default to successful PATCH request for permission changes
  // 204 = successful, no content in response
  http.patch('/api/files/:fspName', () => {
    return HttpResponse.json(null, { status: 204 });
  }),
  http.delete('/api/files/:fspName', () => {
    return HttpResponse.json(null, { status: 200 });
  }),

  // Tickets
  http.get('/api/ticket', () => {
    return HttpResponse.json({
      tickets: [
        {
          username: 'testuser',
          path: 'test_user_zarr',
          fsp_name: 'groups_scicompsoft_home',
          key: 'FT-79',
          created: '2025-08-05T12:00:00.000000-04:00',
          updated: '2025-08-05T12:30:00.000000-04:00',
          status: 'In Progress',
          resolution: 'Unresolved',
          description:
            'Convert /groups/scicompsoft/home/test_user to a ZARR file.\nDestination folder: \\Users\\test_user\\dev\\fileglancer\nRequested by: test_user',
          link: 'https://hhmi.atlassian.net//browse/FT-79',
          comments: []
        },
        {
          username: 'testuser',
          path: 'test_user_tiff',
          fsp_name: 'groups_scicompsoft_home',
          key: 'FT-80',
          created: '2025-08-04T10:00:00.000000-04:00',
          updated: '2025-08-05T09:00:00.000000-04:00',
          status: 'Closed',
          resolution: 'Resolved',
          description:
            'Backup /groups/scicompsoft/home/test_user to cloud storage.\nRequested by: test_user',
          link: 'https://hhmi.atlassian.net//browse/FT-80',
          comments: []
        }
      ]
    });
  }),
  http.post('/api/ticket', () => {
    return HttpResponse.json({
      username: 'testuser',
      path: '/test/path',
      fsp_name: 'test_fsp',
      key: 'FT-78',
      created: '2025-08-05T11:05:43.533000-04:00',
      updated: '2025-08-05T11:05:43.683000-04:00',
      status: 'Open',
      resolution: 'Unresolved',
      description: 'Test description',
      comments: []
    });
  }),

  // External bucket
  http.get('/api/external-bucket', () => {
    return HttpResponse.json({ buckets: [] }, { status: 200 });
  }),
  http.get('/api/external-buckets/:fspName', () => {
    return HttpResponse.json({ buckets: [] }, { status: 200 });
  }),

  //Profile
  http.get('/api/profile', () => {
    return HttpResponse.json({ username: 'testuser' });
  })
];
