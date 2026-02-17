import { useState } from 'react';
import { Typography, Tabs } from '@material-tailwind/react';
import { HiExternalLink, HiOutlineClipboardCopy } from 'react-icons/hi';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  materialDark,
  coy
} from 'react-syntax-highlighter/dist/esm/styles/prism';

import FgDialog from './FgDialog';
import useDarkMode from '@/hooks/useDarkMode';
import CopyTooltip from '@/components/ui/widgets/CopyTooltip';

export type DataLinkType = 'directory' | 'zarr' | 'n5';

export function inferDataType(path: string): DataLinkType {
  if (/\.zarr(\/|$)/.test(path)) {
    return 'zarr';
  }
  if (/\.n5(\/|$)/.test(path)) {
    return 'n5';
  }
  return 'directory';
}

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
  customStyle
}: CodeBlockProps) {
  const isDarkMode = useDarkMode();

  // Note: margin and marginBottom need to be defined separately because the coy theme in react-syntax-highlighter defines both.
  // If we only set margin, the coy theme's marginBottom value will override ours and cause extra space at the bottom of the code block.
  const defaultStyle = {
    margin: '0 0',
    marginBottom: '0',
    padding: '3em 3em 1em 1em',
    fontSize: '14px',
    lineHeight: '1.5',
    width: '100%',
    boxSizing: 'border-box' as const,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    overflowX: 'hidden' as const,
    borderRadius: '0.5rem',
    background: isDarkMode ? '#2f2f2f' : '#fdfdfd'
  };

  const mergedCustomStyle = customStyle
    ? { ...defaultStyle, ...customStyle }
    : defaultStyle;

  // Get the theme's code styles and merge with custom codeTagProps
  const theme = isDarkMode ? materialDark : coy;
  const themeCodeStyles = theme['code[class*="language-"]'] || {};
  const mergedCodeTagProps = {
    style: {
      ...themeCodeStyles,
      paddingBottom: '1.5em',
      whiteSpace: 'pre-wrap' as const,
      wordBreak: 'break-word' as const
    }
  };

  return (
    <div className="relative w-full min-w-0 rounded-lg border border-surface dark:border-foreground/30">
      <SyntaxHighlighter
        codeTagProps={mergedCodeTagProps}
        customStyle={mergedCustomStyle}
        language={language}
        showLineNumbers={showLineNumbers}
        style={theme}
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
    <ol className="space-y-6 text-foreground">
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
  readonly dataType: DataLinkType;
  readonly open: boolean;
  readonly onClose: () => void;
};

function getNapariZarrTab(dataLinkUrl: string) {
  return {
    id: 'napari',
    label: 'Napari',
    content: (
      <ol className="space-y-6 text-foreground">
        <li className="flex items-start gap-3 text-sm">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold">
            1
          </span>
          <div className="flex flex-col gap-2 pt-0.5 min-w-0 flex-1">
            <span>Install napari.</span>
            <CodeBlock
              code={`conda create -y -n napari-env -c conda-forge python=3.11
conda activate napari-env
conda install -c conda-forge napari pyqt`}
              copyLabel="Copy code"
              copyable={true}
              language="bash"
            />
            <a
              className="flex items-center gap-1 text-primary hover:underline"
              href="https://napari.org/stable/tutorials/fundamentals/installation.html"
              rel="noopener noreferrer"
              target="_blank"
            >
              <span>Full installation instructions</span>
              <HiExternalLink className="icon-xsmall" />
            </a>
          </div>
        </li>
        <li className="flex items-start gap-3 text-sm">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold">
            2
          </span>
          <div className="flex flex-col gap-2 pt-0.5 min-w-0 flex-1">
            <span>
              Install the napari-ome-zarr plugin. Assuming you are in the conda
              environment, from the command line:
            </span>
            <CodeBlock
              code="pip install napari-ome-zarr"
              copyLabel="Copy code"
              copyable={true}
              language="bash"
            />
          </div>
        </li>
        <li className="flex items-start gap-3 text-sm">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-semibold">
            3
          </span>
          <div className="flex flex-col gap-2 pt-0.5 min-w-0 flex-1">
            <span>
              Launch napari and open the data link using the napari-ome-zarr
              plugin. From the command line:
            </span>
            <CodeBlock
              code={`napari --plugin napari-ome-zarr '${dataLinkUrl}'`}
              copyLabel="Copy code"
              copyable={true}
              language="bash"
            />
            <span>Or in Python:</span>
            <CodeBlock
              code={`import napari

viewer = napari.Viewer()
viewer.open('${dataLinkUrl}', plugin='napari-ome-zarr')

napari.run()`}
              copyLabel="Copy code"
              copyable={true}
              language="python"
            />
          </div>
        </li>
      </ol>
    )
  };
}

function getFijiTab() {
  return {
    id: 'fiji',
    label: 'Fiji',
    content: (
      <InstructionBlock
        steps={[
          'Launch Fiji',
          'Navigate to Plugins \u2192 BigDataViewer \u2192 HDF5/N5/Zarr/OME-NGFF Viewer',
          'Paste your data link into the text input area located at the top of the "Main" tab of the resulting dialog. Then click "Detect datasets"',
          'In the text area under where you pasted the data link, you should now see the image file name, followed by "multiscale". Click on this entry, then click "OK"'
        ]}
      />
    )
  };
}

function getTabsForDataType(dataType: DataLinkType, dataLinkUrl: string) {
  if (dataType === 'directory') {
    return [
      {
        id: 'java',
        label: 'Java',
        content: (
          <CodeBlock
            code={`import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;
import org.w3c.dom.Element;
import java.io.ByteArrayInputStream;

public class ListFiles {
    private static final String URL = '${dataLinkUrl}';

    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(URL + "?list-type=2&delimiter=/"))
            .GET()
            .build();

        HttpResponse<String> response = client.send(request,
            HttpResponse.BodyHandlers.ofString());

        Document doc = DocumentBuilderFactory.newInstance()
            .newDocumentBuilder()
            .parse(new ByteArrayInputStream(
                response.body().getBytes()));

        // Print files
        NodeList contents = doc.getElementsByTagName("Contents");
        for (int i = 0; i < contents.getLength(); i++) {
            Element el = (Element) contents.item(i);
            String key = el.getElementsByTagName("Key")
                .item(0).getTextContent();
            String size = el.getElementsByTagName("Size")
                .item(0).getTextContent();
            System.out.println(key + "  (" + size + " bytes)");
        }

        // Print subdirectories
        NodeList prefixes = doc.getElementsByTagName("CommonPrefixes");
        for (int i = 0; i < prefixes.getLength(); i++) {
            Element el = (Element) prefixes.item(i);
            String prefix = el.getElementsByTagName("Prefix")
                .item(0).getTextContent();
            System.out.println(prefix + "  (directory)");
        }
    }
}`}
            copyLabel="Copy code"
            copyable={true}
            language="java"
          />
        )
      },
      {
        id: 'python',
        label: 'Python',
        content: (
          <>
            <InstructionBlock steps={['Install requests package']} />
            <CodeBlock
              code={`import requests
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
    print(f'{dirname}  (directory)')`}
              copyLabel="Copy code"
              copyable={true}
              language="python"
            />
          </>
        )
      }
    ];
  }

  if (dataType === 'zarr') {
    return [
      getFijiTab(),
      {
        id: 'java',
        label: 'Java',
        content: (
          <CodeBlock
            code={`import org.janelia.saalfeldlab.n5.DataBlock;
import org.janelia.saalfeldlab.n5.DatasetAttributes;
import org.janelia.saalfeldlab.n5.N5Reader;
import org.janelia.saalfeldlab.n5.N5URI;
import org.janelia.saalfeldlab.n5.universe.N5Factory;
import org.janelia.saalfeldlab.n5.universe.StorageFormat;

import java.util.Arrays;

public class ReadZarr {
    private static final String URL = '${dataLinkUrl}';

    public static void main(String[] args) throws Exception {
        N5URI n5URI = new N5URI(URL);
        N5Factory n5Factory = new N5Factory().cacheAttributes(true);
        N5Reader reader = n5Factory.openReader(StorageFormat.ZARR, n5URI.getURI());

        String dataset = "0";
        DatasetAttributes attrs = reader.getDatasetAttributes(dataset);
        System.out.println("Shape: " + Arrays.toString(attrs.getDimensions()));
        System.out.println("Dtype: " + attrs.getDataType());
        System.out.println("Block size: " + Arrays.toString(attrs.getBlockSize()));

        // Read a block and print voxel values
        long[] blockPosition = new long[attrs.getBlockSize().length];
        DataBlock<?> block = reader.readBlock(
            dataset, attrs, blockPosition);
        if (block != null) {
            Object data = block.getData();
            if (data instanceof short[]) {
                short[] arr = (short[]) data;
                System.out.println("First 10 voxels: " + Arrays.toString(Arrays.copyOf(arr, Math.min(10, arr.length))));
            } else if (data instanceof float[]) {
                float[] arr = (float[]) data;
                System.out.println("First 10 voxels: " + Arrays.toString(Arrays.copyOf(arr, Math.min(10, arr.length))));
            } else if (data instanceof byte[]) {
                byte[] arr = (byte[]) data;
                System.out.println("First 10 voxels: " + Arrays.toString(Arrays.copyOf(arr, Math.min(10, arr.length))));
            }
        }

        reader.close();
    }
}`}
            copyLabel="Copy code"
            copyable={true}
            language="java"
          />
        )
      },
      getNapariZarrTab(dataLinkUrl),
      {
        id: 'python',
        label: 'Python',
        content: (
          <>
            <InstructionBlock steps={['Install zarr package']} />
            <CodeBlock
              code={`import zarr
from zarr.storage import FsspecStore

url = '${dataLinkUrl}'

# Open the Zarr store over HTTP
store = FsspecStore.from_url(url)
root = zarr.open_group(store, mode='r')

# Access the highest resolution array
arr = root['0']
print(f'Shape: {arr.shape}')
print(f'Dtype: {arr.dtype}')
print(f'Chunks: {arr.chunks}')

# Read and print a slice of voxel data
data = arr[0, 0, :10, :10, :10]
print(f'Voxels:\\n{data}')`}
              copyLabel="Copy code"
              copyable={true}
              language="python"
            />
          </>
        )
      }
    ];
  }

  // dataType === 'n5'
  return [
    getFijiTab(),
    {
      id: 'java',
      label: 'Java',
      content: (
        <CodeBlock
          code={`import org.janelia.saalfeldlab.n5.DataBlock;
import org.janelia.saalfeldlab.n5.DatasetAttributes;
import org.janelia.saalfeldlab.n5.N5Reader;
import org.janelia.saalfeldlab.n5.N5URI;
import org.janelia.saalfeldlab.n5.universe.N5Factory;
import org.janelia.saalfeldlab.n5.universe.StorageFormat;

import java.util.Arrays;

public class ReadN5 {
    private static final String URL = '${dataLinkUrl}';

    public static void main(String[] args) throws Exception {
        N5URI n5URI = new N5URI(URL);
        N5Factory n5Factory = new N5Factory().cacheAttributes(true);
        N5Reader reader = n5Factory.openReader(StorageFormat.N5, n5URI.getURI());

        String dataset = "s0";
        DatasetAttributes attrs = reader.getDatasetAttributes(dataset);
        System.out.println("Shape: " + Arrays.toString(attrs.getDimensions()));
        System.out.println("Dtype: " + attrs.getDataType());
        System.out.println("Block size: " + Arrays.toString(attrs.getBlockSize()));

        // Read a block and print voxel values
        long[] blockPosition = new long[attrs.getBlockSize().length];
        DataBlock<?> block = reader.readBlock(
            dataset, attrs, blockPosition);
        if (block != null) {
            Object data = block.getData();
            if (data instanceof short[]) {
                short[] arr = (short[]) data;
                System.out.println("First 10 voxels: " + Arrays.toString(Arrays.copyOf(arr, Math.min(10, arr.length))));
            } else if (data instanceof float[]) {
                float[] arr = (float[]) data;
                System.out.println("First 10 voxels: " + Arrays.toString(Arrays.copyOf(arr, Math.min(10, arr.length))));
            } else if (data instanceof byte[]) {
                byte[] arr = (byte[]) data;
                System.out.println("First 10 voxels: " + Arrays.toString(Arrays.copyOf(arr, Math.min(10, arr.length))));
            }
        }

        reader.close();
    }
}`}
          copyLabel="Copy code"
          copyable={true}
          language="java"
        />
      )
    },
    {
      id: 'napari',
      label: 'Napari',
      content: (
        <InstructionBlock
          steps={[
            'Napari does not natively support N5 datasets',
            'Convert N5 to OME-Zarr, or use Fiji to view N5 data directly'
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

url = '${dataLinkUrl}'

# Open the N5 store over HTTP
store = FsspecStore.from_url(url)
root = zarr.open_group(store, mode='r')

# Access the highest resolution array
arr = root['s0']
print(f'Shape: {arr.shape}')
print(f'Dtype: {arr.dtype}')
print(f'Chunks: {arr.chunks}')

# Read and print a slice of voxel data
data = arr[:10, :10, :10]
print(f'Voxels:\\n{data}')`}
            copyLabel="Copy code"
            copyable={true}
            language="python"
          />
        </>
      )
    }
  ];
}

export default function DataLinkUsageDialog({
  dataLinkUrl,
  dataType,
  open,
  onClose
}: DataLinkUsageDialogProps) {
  const tabs = getTabsForDataType(dataType, dataLinkUrl);
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.id ?? '');

  const TAB_TRIGGER_CLASSES = '!text-foreground h-full';
  const PANEL_CLASSES =
    'flex flex-col gap-4 max-w-full max-h-[65vh] p-4 rounded-b-lg border border-t-0 border-surface dark:border-foreground/30 bg-surface-light dark:bg-surface overflow-y-auto overflow-x-hidden';

  return (
    <FgDialog
      className="max-w-4xl w-11/12 md:w-11/12 lg:w-10/12 dark:bg-surface"
      onClose={onClose}
      open={open}
    >
      <div className="flex flex-col gap-4 my-4 min-h-0 max-h-[85vh]">
        <Typography className="text-foreground font-semibold text-lg w-[95%] self-center">
          How to use your data link
        </Typography>
        <div className="flex items-center gap-2 w-[95%] self-center border border-surface rounded-lg px-3 py-2 bg-surface-light overflow-hidden">
          <span className="text-foreground text-sm font-mono truncate flex-1 min-w-0">
            {dataLinkUrl}
          </span>
          <CopyTooltip
            primaryLabel="Copy data link"
            textToCopy={dataLinkUrl}
            tooltipTriggerClasses={TOOLTIP_TRIGGER_CLASSES}
          >
            <HiOutlineClipboardCopy className="icon-default text-foreground shrink-0" />
          </CopyTooltip>
        </div>
        <Tabs
          className="flex flex-col flex-1 min-h-0 gap-0 max-h-[75vh] w-[95%] self-center"
          key="data-link-usage-tabs"
          onValueChange={setActiveTab}
          value={activeTab}
        >
          <Tabs.List className="justify-start items-stretch shrink-0 min-w-fit w-full py-2 rounded-b-none bg-surface dark:bg-surface-light">
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
