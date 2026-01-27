import { useState } from 'react';
import { Typography, Tabs } from '@material-tailwind/react';
import { HiOutlineClipboardCopy } from 'react-icons/hi';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  materialDark,
  coy
} from 'react-syntax-highlighter/dist/esm/styles/prism';

import FgDialog from './FgDialog';
import useDarkMode from '@/hooks/useDarkMode';
import CopyTooltip from '@/components/ui/widgets/CopyTooltip';

type CodeBlockProps = {
  readonly code: string;
  readonly language?: string;
  readonly showLineNumbers?: boolean;
  readonly wrapLines?: boolean;
  readonly wrapLongLines?: boolean;
  readonly copyable?: boolean;
  readonly copyLabel?: string;
  readonly customStyle?: React.CSSProperties;
};

const TOOLTIP_TRIGGER_CLASSES =
  'text-foreground/50 hover:text-foreground py-1 px-2';

function CodeBlock({
  code,
  language = 'text',
  showLineNumbers = false,
  wrapLines = true,
  wrapLongLines = true,
  copyable = false,
  copyLabel = 'Copy code',
  customStyle = {
    margin: 0,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    paddingTop: '3em',
    paddingRight: '1em',
    paddingBottom: '0',
    paddingLeft: '1em',
    fontSize: '14px',
    lineHeight: '1.5'
  }
}: CodeBlockProps) {
  const isDarkMode = useDarkMode();

  // Get the theme's code styles and merge with custom codeTagProps
  const theme = isDarkMode ? materialDark : coy;
  const themeCodeStyles = theme['code[class*="language-"]'] || {};
  const mergedCodeTagProps = {
    style: {
      ...themeCodeStyles,
      paddingBottom: '1em'
    }
  };

  return (
    <div className="relative">
      <SyntaxHighlighter
        codeTagProps={mergedCodeTagProps}
        customStyle={customStyle}
        language={language}
        showLineNumbers={showLineNumbers}
        style={isDarkMode ? materialDark : coy}
        wrapLines={wrapLines}
        wrapLongLines={wrapLongLines}
      >
        {code}
      </SyntaxHighlighter>
      {copyable ? (
        <div className="absolute top-2 right-2">
          <CopyTooltip
            primaryLabel={copyLabel}
            textToCopy={code}
            tooltipTriggerClasses={TOOLTIP_TRIGGER_CLASSES}
          >
            <HiOutlineClipboardCopy className="icon-default" />
          </CopyTooltip>
        </div>
      ) : null}
    </div>
  );
}

type InstructionBlockProps = {
  readonly steps: string[];
};

function InstructionBlock({ steps }: InstructionBlockProps) {
  return (
    <ol className="space-y-3 text-foreground">
      {steps.map((step, index) => (
        <li className="flex items-start gap-3 text-sm" key={index}>
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold">
            {index + 1}
          </span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

type DataLinkUsageDialogProps = {
  readonly dataLinkUrl: string;
  readonly open: boolean;
  readonly onClose: () => void;
};

export default function DataLinkUsageDialog({
  dataLinkUrl,
  open,
  onClose
}: DataLinkUsageDialogProps) {
  const [activeTab, setActiveTab] = useState<string>('napari');

  const tabs = [
    {
      id: 'napari',
      label: 'Napari',
      content: (
        <InstructionBlock
          steps={[
            'Install napari-ome-zarr plugin',
            'Launch napari',
            'Open the data URL'
          ]}
        />
      )
    },
    {
      id: 'python',
      label: 'Python',
      content: (
        <>
          <InstructionBlock steps={['Install zarr package']} />
          <CodeBlock
            code={`import zarr
from zarr.storage import FsspecStore
from ome_zarr_models.v04.image import Image

url = '${dataLinkUrl}'

# Open the zarr store using fsspec for HTTP access
store = FsspecStore.from_url(url)
root = zarr.open_group(store, mode='r')

# Read OME-ZARR metadata using ome-zarr-models
ome_image = Image.from_zarr(root)
ome_image_metadata = ome_image.attributes
multiscales = ome_image_metadata.multiscales
print(f'Version: {multiscales[0].version}')
print(f'Name: {multiscales[0].name}')
print(f'Axes: {[(ax.name, ax.type, ax.unit) for ax in multiscales[0].axes]}')
print(f'Datasets: {[ds.path for ds in multiscales[0].datasets]}')

# Print coordinate transforms for each scale level
for ds in multiscales[0].datasets:
    if ds.coordinateTransformations:
        for ct in ds.coordinateTransformations:
            if hasattr(ct, 'scale'):
                print(f'{ds.path} scale: {ct.scale}')
            if hasattr(ct, 'translation'):
                print(f'{ds.path} translation: {ct.translation}')

# Access the highest resolution array
if '0' in root:
    arr = root['0']
    print(f'\\nHighest resolution array shape: {arr.shape}')
    print(f'Array dtype: {arr.dtype}')
    print(f'Array chunks: {arr.chunks}')

# Read a small slice of data
if '0' in root:
    data = arr[0,0,500:600,1000:1100,1000:1100]
    print(f'\\nLoaded slice shape: {data.shape}')
    print(f'Data min: {data.min()}, max: {data.max()}')`}
            copyLabel="Copy code"
            copyable={true}
            language="python"
          />
        </>
      )
    },
    {
      id: 'java',
      label: 'Java',
      content: (
        <CodeBlock
          code={`package org.janelia.omezarr.example;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.janelia.saalfeldlab.n5.DataBlock;
import org.janelia.saalfeldlab.n5.DatasetAttributes;
import org.janelia.saalfeldlab.n5.N5Reader;
import org.janelia.saalfeldlab.n5.N5URI;
import org.janelia.saalfeldlab.n5.imglib2.N5Utils;
import org.janelia.saalfeldlab.n5.universe.N5Factory;
import org.janelia.saalfeldlab.n5.universe.StorageFormat;

import net.imglib2.RandomAccessibleInterval;
import net.imglib2.type.NativeType;
import net.imglib2.type.numeric.RealType;
import net.imglib2.view.Views;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URL;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Simple example to read OME-ZARR from an HTTP URL using N5-Zarr.
 */
public class ReadOmeZarr {
    private static final String URL = '${dataLinkUrl}';
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    public static void main(String[] args) {
        // Use URL from args if provided, otherwise use default
        String url = args.length > 0 ? args[0] : URL;
        String groupName = args.length > 1 ? args[1] : "r0";
        String arraySubpath = args.length > 2 ? args[2] : "0";
        runExampleUsingN5API(url, groupName, arraySubpath);
    }


    private static void runExampleUsingN5API(String url, String groupName, String arraySubpath) {
        try {
            N5URI n5URI = new N5URI(url).resolve(groupName);
            // Open the zarr store using N5ZarrReader for HTTP access
            N5Factory n5Factory = new N5Factory().cacheAttributes(true);
            N5Reader reader = n5Factory.openReader(StorageFormat.ZARR, n5URI.getURI());
            // new N5Factory().openReader(n5URI.getContainerPath());

            // Read OME-ZARR metadata from .zattrs
            JsonObject zattrs = readZattrs(n5URI);
            if (zattrs != null && zattrs.has("multiscales")) {
                JsonArray multiscales = zattrs.getAsJsonArray("multiscales");
                JsonObject firstMultiscale = multiscales.get(0).getAsJsonObject();

                // Print version
                if (firstMultiscale.has("version")) {
                    System.out.println("  Version: " + firstMultiscale.get("version").getAsString());
                }

                // Print name
                if (firstMultiscale.has("name")) {
                    System.out.println("  Name: " + firstMultiscale.get("name").getAsString());
                }

                // Print axes
                if (firstMultiscale.has("axes")) {
                    JsonArray axes = firstMultiscale.getAsJsonArray("axes");
                    System.out.print("  Axes: [");
                    for (int i = 0; i < axes.size(); i++) {
                        JsonObject axis = axes.get(i).getAsJsonObject();
                        String name = axis.get("name").getAsString();
                        String type = axis.has("type") ? axis.get("type").getAsString() : "null";
                        String unit = axis.has("unit") ? axis.get("unit").getAsString() : "null";
                        System.out.print("(" + name + ", " + type + ", " + unit + ")");
                        if (i < axes.size() - 1) System.out.print(", ");
                    }
                    System.out.println("]");
                }

                // Print datasets
                if (firstMultiscale.has("datasets")) {
                    JsonArray datasets = firstMultiscale.getAsJsonArray("datasets");
                    System.out.print("  Datasets: [");
                    for (int i = 0; i < datasets.size(); i++) {
                        JsonObject ds = datasets.get(i).getAsJsonObject();
                        System.out.print(ds.get("path").getAsString());
                        if (i < datasets.size() - 1) System.out.print(", ");
                    }
                    System.out.println("]");

                    // Print coordinate transforms for each scale level
                    for (int i = 0; i < datasets.size(); i++) {
                        JsonObject ds = datasets.get(i).getAsJsonObject();
                        String path = ds.get("path").getAsString();
                        if (ds.has("coordinateTransformations")) {
                            JsonArray transforms = ds.getAsJsonArray("coordinateTransformations");
                            for (JsonElement t : transforms) {
                                JsonObject transform = t.getAsJsonObject();
                                if (transform.has("scale")) {
                                    JsonArray scale = transform.getAsJsonArray("scale");
                                    System.out.println("  " + path + " scale: " + scale);
                                }
                                if (transform.has("translation")) {
                                    JsonArray translation = transform.getAsJsonArray("translation");
                                    System.out.println("  " + path + " translation: " + translation);
                                }
                            }
                        }
                    }
                }
            }

            // Access the highest resolution array (dataset "0")
            if (reader.exists(arraySubpath)) {
                DatasetAttributes attrs = reader.getDatasetAttributes(arraySubpath);
                long[] dimensions = attrs.getDimensions();
                int[] blockSize = attrs.getBlockSize();

                System.out.println("\\nHighest resolution array shape: " + Arrays.toString(dimensions));
                System.out.println("Array dtype: " + attrs.getDataType());
                System.out.println("Array chunks: " + Arrays.toString(blockSize));

                // N5 reads whole chunks, so we read a block at a position that covers similar data
                // Note that in java the order of the axes is: XYZCT
                long[] blockGridPosition = new long[]{
                    1000 / blockSize[0], 1000 / blockSize[1], 500 / blockSize[2], 0, 0
                };
                double[] minMax = readBlockMinMax(reader, "0", blockGridPosition);
                if (minMax != null) {
                    System.out.println("\\nBlock at grid position " + Arrays.toString(blockGridPosition) + ":");
                    System.out.println("Data min: " + minMax[0] + ", max: " + minMax[1]);
                }

                // Use imglib2 to read an arbitrary interval (similar to Python slice [0,0,500:600,1000:1100,1000:1100])
                // In Java XYZCT order: x=[1000,1100), y=[1000,1100), z=[500,600), c=0, t=0
                long[] intervalMin = new long[]{1000, 1000, 500, 0, 0};
                long[] intervalMax = new long[]{1099, 1099, 599, 0, 0};
                double[] intervalMinMax = readIntervalMinMax(reader, "0", intervalMin, intervalMax);
                if (intervalMinMax != null) {
                    System.out.println("\\nInterval [" + Arrays.toString(intervalMin) + " - " + Arrays.toString(intervalMax) + "]:");
                    System.out.println("Data min: " + intervalMinMax[0] + ", max: " + intervalMinMax[1]);
                }
            }

            reader.close();

        } catch (Exception e) {
            System.err.println("Error reading OME-ZARR: " + e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * Read the .zattrs file from the Zarr root to get OME-ZARR metadata.
     */
    private static JsonObject readZattrs(N5URI baseUrl) {
        try {
            N5URI zattrsUri = baseUrl.resolve(".zattrs");
            URL url = zattrsUri.getURI().toURL();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(url.openStream()))) {
                String content = reader.lines().collect(Collectors.joining("\\n"));
                return GSON.fromJson(content, JsonObject.class);
            }
        } catch (Exception e) {
            System.err.println("Could not read .zattrs: " + e.getMessage());
            return null;
        }
    }

    /**
     * Read a data block and compute its min and max values.
     */
    private static double[] readBlockMinMax(N5Reader reader, String dataset, long[] gridPosition) {
        try {
            DataBlock<?> block = reader.readBlock(dataset, reader.getDatasetAttributes(dataset), gridPosition);
            if (block == null) {
                System.err.println("Block not found at position " + Arrays.toString(gridPosition));
                return null;
            }

            Object data = block.getData();
            double min = Double.MAX_VALUE;
            double max = Double.MIN_VALUE;

            if (data instanceof short[]) {
                short[] arr = (short[]) data;
                for (short v : arr) {
                    int unsigned = v & 0xFFFF;
                    if (unsigned < min) min = unsigned;
                    if (unsigned > max) max = unsigned;
                }
            } else if (data instanceof int[]) {
                int[] arr = (int[]) data;
                for (int v : arr) {
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
            } else if (data instanceof float[]) {
                float[] arr = (float[]) data;
                for (float v : arr) {
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
            } else if (data instanceof double[]) {
                double[] arr = (double[]) data;
                for (double v : arr) {
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
            } else if (data instanceof byte[]) {
                byte[] arr = (byte[]) data;
                for (byte v : arr) {
                    int unsigned = v & 0xFF;
                    if (unsigned < min) min = unsigned;
                    if (unsigned > max) max = unsigned;
                }
            } else if (data instanceof long[]) {
                long[] arr = (long[]) data;
                for (long v : arr) {
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
            } else {
                System.err.println("Unsupported data type: " + data.getClass().getSimpleName());
                return null;
            }

            return new double[]{min, max};
        } catch (Exception e) {
            System.err.println("Error reading block: " + e.getMessage());
            return null;
        }
    }

    /**
     * Read an arbitrary interval using imglib2 and compute min/max values.
     */
    private static <T extends NativeType<T> & RealType<T>> double[] readIntervalMinMax(
            N5Reader reader, String dataset, long[] intervalMin, long[] intervalMax) {
        try {
            RandomAccessibleInterval<T> img = N5Utils.open(reader, dataset);
            RandomAccessibleInterval<T> interval = Views.interval(img, intervalMin, intervalMax);

            double min = Double.MAX_VALUE;
            double max = -Double.MAX_VALUE;

            for (T pixel : Views.flatIterable(interval)) {
                double val = pixel.getRealDouble();
                if (val < min) min = val;
                if (val > max) max = val;
            }

            return new double[]{min, max};
        } catch (Exception e) {
            System.err.println("Error reading interval: " + e.getMessage());
            return null;
        }
    }
}
  `}
          copyLabel="Copy code"
          copyable={true}
          language="python"
        />
      )
    },
    {
      id: 'fiji',
      label: 'Fiji',
      content: (
        <InstructionBlock
          steps={[
            'Launch Fiji',
            'Navigate to Plugins → BigDataViewer → HDF5/N5/Zarr/OME-NGFF Viewer',
            'Paste data link and click "Detect datasets"',
            'Select the multiscale image and click "OK"'
          ]}
        />
      )
    },
    {
      id: 'vvdViewer',
      label: 'VVDViewer',
      content: (
        <InstructionBlock
          steps={[
            'Install VVDViewer',
            'Launch VVDViewer',
            'Navigate to File → Open URL',
            'Paste data link and click "OK"'
          ]}
        />
      )
    }
  ];

  const TAB_TRIGGER_CLASSES = '!text-foreground h-full';
  const PANEL_CLASSES =
    'flex-1 flex flex-col gap-4 max-w-full p-4 rounded-b-lg border border-t-0 border-surface bg-surface-light';

  return (
    <FgDialog onClose={onClose} open={open}>
      <div className="flex flex-col gap-4 my-4">
        <div className="flex items-center gap-4">
          <Typography className="text-foreground font-semibold text-lg">
            How to use your data link
          </Typography>
          <CopyTooltip
            primaryLabel="Copy data link"
            textToCopy={dataLinkUrl}
            tooltipTriggerClasses={TOOLTIP_TRIGGER_CLASSES}
          >
            <HiOutlineClipboardCopy className="icon-default" />
          </CopyTooltip>
        </div>
        <Tabs
          className="flex flex-col flex-1 min-h-0 gap-0 max-h-[50vh]"
          key="data-link-usage-tabs"
          onValueChange={setActiveTab}
          value={activeTab}
        >
          <Tabs.List className="justify-start items-stretch shrink-0 min-w-fit w-full rounded-b-none bg-surface dark:bg-surface-light">
            {tabs.map(tab => (
              <Tabs.Trigger
                className={TAB_TRIGGER_CLASSES}
                key={tab.id}
                value={tab.id}
              >
                {tab.label}
              </Tabs.Trigger>
            ))}
            <Tabs.TriggerIndicator className="h-full" />
          </Tabs.List>

          {tabs.map(tab => (
            <Tabs.Panel className={PANEL_CLASSES} key={tab.id} value={tab.id}>
              {tab.content}
            </Tabs.Panel>
          ))}
        </Tabs>
      </div>
    </FgDialog>
  );
}
