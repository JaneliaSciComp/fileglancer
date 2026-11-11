import { expect, test } from '../fixtures/fileglancer-fixture';
import { navigateToScratchFsp } from '../utils/navigation';

const BUCKET = {
  name: 'example',
  zone: 'S3',
  group: 'cloud',
  storage: 'Example',
  mount_path: 'https://example-datasets.s3.amazonaws.com',
  linux_path: null,
  mac_path: null,
  windows_path: null,
  protocol: 's3'
};

const entry = (
  name: string,
  path: string,
  absolute: string,
  isDir: boolean
) => ({
  name,
  path,
  is_dir: isDir,
  size: 0,
  permissions: 'dr-xr-xr-x',
  hasRead: true,
  hasWrite: false,
  is_symlink: false,
  last_modified: null,
  owner: null,
  group: null,
  absolute_path: absolute
});

test('add a public bucket, browse it read-only, return to a local share', async ({
  fileglancerPage: page
}) => {
  let added = false;

  await page.route('**/api/cloud-storage/buckets', async route => {
    if (route.request().method() === 'POST') {
      added = true;
      await route.fulfill({ status: 201, json: BUCKET });
    } else {
      await route.fulfill({ json: { buckets: added ? [BUCKET] : [] } });
    }
  });
  await page.route('**/api/file-share-paths', async route => {
    const response = await route.fetch();
    const body = await response.json();
    if (added) {
      body.paths.push(BUCKET);
    }
    await route.fulfill({ response, json: body });
  });
  await page.route('**/api/files/example*', async route => {
    await route.fulfill({
      json: {
        info: entry(
          'example',
          '.',
          'https://example-datasets.s3.amazonaws.com',
          true
        ),
        files: [
          entry(
            'sample.zarr',
            'sample.zarr',
            'https://example-datasets.s3.amazonaws.com/sample.zarr',
            true
          )
        ]
      }
    });
  });

  // Refetch file-share-paths through the stubs
  await page.goto('/browse', { waitUntil: 'domcontentloaded' });

  // The Cloud Storage section starts expanded; toggle it closed and open again.
  const header = page.getByRole('button', { name: 'Cloud Storage' });
  const sidebar = page.getByLabel('List of cloud storage buckets');
  await expect(sidebar).toBeVisible();
  await header.click();
  await expect(sidebar).toBeHidden();
  await header.click();
  await expect(sidebar.getByText('S3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add bucket' }).click();

  await page.getByLabel('Bucket name').fill('example-datasets');
  await page.getByLabel('Display name').fill('Example');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page).toHaveURL(/\/browse\/example$/);
  await expect(sidebar.getByRole('link', { name: /^Example/ })).toBeVisible();
  await expect(page.getByText('sample.zarr')).toBeVisible();
  await expect(page.getByRole('button', { name: /new folder/i })).toHaveCount(
    0
  );

  await navigateToScratchFsp(page);
  await expect(page.getByRole('button', { name: /new folder/i })).toBeVisible();
});
