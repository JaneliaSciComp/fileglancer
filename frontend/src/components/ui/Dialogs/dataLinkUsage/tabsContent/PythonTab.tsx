import CodeBlock from '@/components/ui/Dialogs/dataLinkUsage/CodeBlock';
import PrerequisitesBlock from '@/components/ui/Dialogs/dataLinkUsage/PrerequisitesBlock';
import InstructionBlock from '@/components/ui/Dialogs/dataLinkUsage/InstructionBlock';

import type {
  DataLinkType,
  ZarrVersion
} from '@/components/ui/Dialogs/dataLinkUsage/DataLinkUsageDialog';

function getCodeForDataType(
  dataType: DataLinkType,
  dataLinkUrl: string,
  zarrVersion?: ZarrVersion
) {
  if (dataType === 'directory') {
    return `pixi exec --spec requests -- python -c "
import requests
import xml.etree.ElementTree as ET

url = '${dataLinkUrl}'

# List files using S3-compatible ListObjectsV2 API
response = requests.get(url, params={'list-type': '2', 'delimiter': '/'})
response.raise_for_status()

root = ET.fromstring(response.text)
ns = root.tag.split('}')[0] + '}' if '}' in root.tag else ''

# Print files
for contents in root.findall(f'{ns}Contents'):
    key = contents.find(f'{ns}Key').text
    size = contents.find(f'{ns}Size').text
    print(f'{key}  ({size} bytes)')

# Print subdirectories
for prefix in root.findall(f'{ns}CommonPrefixes'):
    dirname = prefix.find(f'{ns}Prefix').text
    print(f'{dirname}  (directory)')
"`;
  }

  if (dataType === 'n5') {
    return `pixi exec --spec tensorstore -- python -c "
import tensorstore as ts

# Open the N5 store over HTTP
# Point to a specific dataset (e.g. s0) within the N5 container
dataset = ts.open({
    'driver': 'n5',
    'kvstore': '${dataLinkUrl}/s0/',
}).result()

print(f'Shape: {dataset.shape}')
print(f'Dtype: {dataset.dtype}')

# Read and print a slice of voxel data
data = dataset[:10, :10, :10].read().result()
print(f'Voxels:\\n{data}')
"`;
  }

  if (dataType === 'zarr') {
    return `pixi exec --spec zarr --spec fsspec --spec requests --spec aiohttp -- python -c "
import zarr
from zarr.storage import FsspecStore

url = '${dataLinkUrl}'

# Open the Zarr array over HTTP
store = FsspecStore.from_url(url)
arr = zarr.open_array(store, mode='r')
print(f'Shape: {arr.shape}')
print(f'Dtype: {arr.dtype}')
print(f'Chunks: {arr.chunks}')

# Read and print a small slice of voxel data
slicing = tuple(slice(0, min(10, s)) for s in arr.shape)
data = arr[slicing]
print(f'Voxels:\\n{data}')
"`;
  }

  // ome-zarr
  if (zarrVersion === 3) {
    // OME-Zarr v0.5 (Zarr v3)
    return `pixi exec --spec zarr --spec fsspec --spec requests --spec aiohttp -- python -c "
import zarr
from zarr.storage import FsspecStore

url = '${dataLinkUrl}'

# Open the highest resolution array directly (e.g., path 's0')
arr = zarr.open_array(FsspecStore.from_url(f'{url}/s0'), mode='r')
print(f'Shape: {arr.shape}')
print(f'Dtype: {arr.dtype}')
print(f'Chunks: {arr.chunks}')

# Read and print a small slice of voxel data
slicing = tuple(slice(0, min(10, s)) for s in arr.shape)
data = arr[slicing]
print(f'Voxels:\\n{data}')
"`;
  }

  // OME-Zarr v0.4 (Zarr v2)
  return `pixi exec --spec zarr --spec fsspec --spec requests --spec aiohttp -- python -c "
import zarr
from zarr.storage import FsspecStore

url = '${dataLinkUrl}'

# Open the OME-Zarr v0.4 store over HTTP (Zarr v2 format)
store = FsspecStore.from_url(url)
root = zarr.open_group(store, mode='r')

# Access the highest resolution array
arr = root['0']
print(f'Shape: {arr.shape}')
print(f'Dtype: {arr.dtype}')
print(f'Chunks: {arr.chunks}')

# Read and print a small slice of voxel data
slicing = tuple(slice(0, min(10, s)) for s in arr.shape)
data = arr[slicing]
print(f'Voxels:\\n{data}')
"`;
}

type PythonTabProps = {
  readonly dataType: DataLinkType;
  readonly dataLinkUrl: string;
  readonly tooltipTriggerClasses: string;
  readonly zarrVersion?: ZarrVersion;
};

export default function PythonTab({
  dataType,
  dataLinkUrl,
  tooltipTriggerClasses,
  zarrVersion
}: PythonTabProps) {
  return (
    <>
      <PrerequisitesBlock
        prerequisites={[
          {
            label: 'Pixi',
            href: 'https://pixi.prefix.dev/latest/installation/'
          }
        ]}
      />
      <InstructionBlock
        steps={[
          'Run this command to use pixi to install the required dependencies and read the data using Python:'
        ]}
      />
      <CodeBlock
        code={getCodeForDataType(dataType, dataLinkUrl, zarrVersion)}
        copyLabel="Copy code"
        copyable={true}
        language="bash"
        tooltipTriggerClasses={tooltipTriggerClasses}
      />
    </>
  );
}
