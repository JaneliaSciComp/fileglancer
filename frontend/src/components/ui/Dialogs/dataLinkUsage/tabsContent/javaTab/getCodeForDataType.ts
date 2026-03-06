import type {
  DataLinkType,
  ZarrVersion
} from '@/components/ui/Dialogs/dataLinkUsage/DataLinkUsageDialog';

function getZarrJavaCode(
  javaClassName: string,
  dataType: DataLinkType,
  dataLinkUrl: string,
  zarrVersion?: ZarrVersion
) {
  if (dataType === 'zarr' && zarrVersion === 3) {
    return `package org.janelia.fileglancer.example;

import dev.zarr.zarrjava.store.FilesystemStore;
import dev.zarr.zarrjava.store.HttpStore;
import dev.zarr.zarrjava.store.Store;
import dev.zarr.zarrjava.v3.Array;

import java.nio.file.Paths;
import java.util.Arrays;

/**
 * Simple example to read a Zarr v3 array from an HTTP URL using zarr-java.
 */
public class ${javaClassName} {
    private static final String URL = "${dataLinkUrl}";

    public static void main(String[] args) {
        String url = args.length > 0 ? args[0] : URL;
        try {
            System.out.println("=== Reading Zarr v3 array ===\\n");

            Store store;
            if (url.startsWith("http://") || url.startsWith("https://")) {
                store = new HttpStore(url);
            } else if (url.startsWith("file://")) {
                String path = url.substring(7);
                store = new FilesystemStore(Paths.get(path));
            } else {
                store = new FilesystemStore(Paths.get(url));
            }

            Array array = Array.open(store.resolve());
            System.out.println("  shape:  " + Arrays.toString(array.metadata().shape));
            System.out.println("  chunks: " + Arrays.toString(array.metadata().chunkShape()));
            System.out.println("  dtype:  " + array.metadata().dataType());

        } catch (Exception e) {
            System.err.println("Error reading Zarr v3 array: " + e.getMessage());
            e.printStackTrace();
        }
    }
}`;
  }

  if (dataType === 'zarr') {
    // Zarr v2
    return `package org.janelia.fileglancer.example;

import org.janelia.saalfeldlab.n5.DatasetAttributes;
import org.janelia.saalfeldlab.n5.N5Reader;
import org.janelia.saalfeldlab.n5.N5URI;
import org.janelia.saalfeldlab.n5.universe.N5Factory;
import org.janelia.saalfeldlab.n5.universe.StorageFormat;

import java.util.Arrays;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Simple example to read a Zarr v2 array from an HTTP URL using n5-universe.
 */
public class ${javaClassName} {
    private static final String URL = "${dataLinkUrl}";

    public static void main(String[] args) {
        // Suppress noisy AWS SDK credential-probe warnings (not on EC2)
        Logger.getLogger("com.amazonaws").setLevel(Level.SEVERE);

        String url = args.length > 0 ? args[0] : URL;
        try {
            System.out.println("=== Reading Zarr v2 array ===\\n");

            N5URI n5URI = new N5URI(url);
            N5Reader reader = new N5Factory()
                    .cacheAttributes(true)
                    .openReader(StorageFormat.ZARR, n5URI.getURI());

            DatasetAttributes attrs = reader.getDatasetAttributes("/");
            System.out.println("  shape:  " + Arrays.toString(attrs.getDimensions()));
            System.out.println("  chunks: " + Arrays.toString(attrs.getBlockSize()));
            System.out.println("  dtype:  " + attrs.getDataType());

            reader.close();
        } catch (Exception e) {
            System.err.println("Error reading Zarr v2 array: " + e.getMessage());
            e.printStackTrace();
        }
    }
}`;
  }

  if (dataType === 'ome-zarr' && zarrVersion === 3) {
    // OME-Zarr v0.5 (Zarr v3)
    return `package org.janelia.fileglancer.example;

import dev.zarr.zarrjava.store.FilesystemStore;
import dev.zarr.zarrjava.store.HttpStore;
import dev.zarr.zarrjava.store.Store;
import dev.zarr.zarrjava.v3.Array;
import dev.zarr.zarrjava.v3.Group;

import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Map;

/**
 * Simple example to read OME-ZARR following the OME-Zarr specification v0.5
 * (Zarr v3) from an HTTP URL using zarr-java.
 */
public class ${javaClassName} {
    private static final String URL = "${dataLinkUrl}";

    public static void main(String[] args) {
        String url = args.length > 0 ? args[0] : URL;
        runExampleUsingJavaZarr(url);
    }

    private static void runExampleUsingJavaZarr(String url) {
        try {
            System.out.println("=== Using zarr-java library ===\\n");

            // Create the appropriate store based on URL scheme
            Store store;
            if (url.startsWith("http://") || url.startsWith("https://")) {
                store = new HttpStore(url);
            } else if (url.startsWith("file://")) {
                String path = url.substring(7); // Remove "file://" prefix
                store = new FilesystemStore(Paths.get(path));
            } else {
                store = new FilesystemStore(Paths.get(url));
            }

            // Open as a Zarr v3 group
            Group root = Group.open(store.resolve());

            // Read OME-Zarr metadata from group attributes
            // OME-Zarr v0.5 nests metadata under "ome" key
            Map<String, Object> attrs = root.metadata().attributes();
            @SuppressWarnings("unchecked")
            Map<String, Object> omeAttrs = attrs.containsKey("ome")
                    ? (Map<String, Object>) attrs.get("ome")
                    : attrs;
            if (omeAttrs.containsKey("multiscales")) {
                @SuppressWarnings("unchecked")
                java.util.List<Map<String, Object>> multiscales = (java.util.List<Map<String, Object>>) omeAttrs
                        .get("multiscales");
                Map<String, Object> firstMultiscale = multiscales.get(0);

                // Print version
                if (firstMultiscale.containsKey("version")) {
                    System.out.println("  Version: " + firstMultiscale.get("version"));
                }

                // Print name
                if (firstMultiscale.containsKey("name")) {
                    System.out.println("  Name: " + firstMultiscale.get("name"));
                }

                // Print axes
                if (firstMultiscale.containsKey("axes")) {
                    @SuppressWarnings("unchecked")
                    java.util.List<Map<String, Object>> axes = (java.util.List<Map<String, Object>>) firstMultiscale
                            .get("axes");
                    System.out.print("  Axes: [");
                    for (int i = 0; i < axes.size(); i++) {
                        Map<String, Object> axis = axes.get(i);
                        String name = (String) axis.get("name");
                        String type = axis.containsKey("type") ? (String) axis.get("type") : "null";
                        String unit = axis.containsKey("unit") ? (String) axis.get("unit") : "null";
                        System.out.print("(" + name + ", " + type + ", " + unit + ")");
                        if (i < axes.size() - 1)
                            System.out.print(", ");
                    }
                    System.out.println("]");
                }

                // Print datasets
                if (firstMultiscale.containsKey("datasets")) {
                    @SuppressWarnings("unchecked")
                    java.util.List<Map<String, Object>> datasets = (java.util.List<Map<String, Object>>) firstMultiscale
                            .get("datasets");
                    System.out.print("  Datasets: [");
                    for (int i = 0; i < datasets.size(); i++) {
                        Map<String, Object> ds = datasets.get(i);
                        System.out.print(ds.get("path"));
                        if (i < datasets.size() - 1)
                            System.out.print(", ");
                    }
                    System.out.println("]");

                    // Print coordinate transforms and array metadata for each dataset
                    for (Map<String, Object> ds : datasets) {
                        String dsPath = (String) ds.get("path");
                        if (ds.containsKey("coordinateTransformations")) {
                            @SuppressWarnings("unchecked")
                            java.util.List<Map<String, Object>> transforms = (java.util.List<Map<String, Object>>) ds
                                    .get("coordinateTransformations");
                            for (Map<String, Object> transform : transforms) {
                                if (transform.containsKey("scale")) {
                                    System.out.println("  " + dsPath + " scale: " + transform.get("scale"));
                                }
                                if (transform.containsKey("translation")) {
                                    System.out.println("  " + dsPath + " translation: " + transform.get("translation"));
                                }
                            }
                        }
                        Array array = Array.open(store.resolve(dsPath));
                        System.out.println("  " + dsPath + " shape:  " + Arrays.toString(array.metadata().shape));
                        System.out
                                .println("  " + dsPath + " chunks: " + Arrays.toString(array.metadata().chunkShape()));
                        System.out.println("  " + dsPath + " dtype:  " + array.metadata().dataType());
                    }
                }
            }

        } catch (Exception e) {
            System.err.println("Error reading OME-ZARR with zarr-java: " + e.getMessage());
            e.printStackTrace();
        }
    }
}`;
  }

  // OME-Zarr v0.4 (Zarr v2) - default for ome-zarr
  return `package org.janelia.fileglancer.example;

import org.janelia.saalfeldlab.n5.DatasetAttributes;
import org.janelia.saalfeldlab.n5.N5Reader;
import org.janelia.saalfeldlab.n5.N5URI;
import org.janelia.saalfeldlab.n5.universe.N5Factory;
import org.janelia.saalfeldlab.n5.universe.StorageFormat;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Simple example to read OME-ZARR following the OME-Zarr specification v0.4
 * (Zarr v2) from an HTTP URL using n5-universe.
 */
public class ${javaClassName} {
    private static final String URL = "${dataLinkUrl}";

    public static void main(String[] args) {
        // Suppress noisy AWS SDK credential-probe warnings (not on EC2)
        Logger.getLogger("com.amazonaws").setLevel(Level.SEVERE);

        String url = args.length > 0 ? args[0] : URL;
        try {
            System.out.println("=== Using n5-universe library (OME-Zarr v0.4 / Zarr v2) ===\\n");

            N5URI n5URI = new N5URI(url);
            N5Reader reader = new N5Factory()
                    .cacheAttributes(true)
                    .openReader(StorageFormat.ZARR, n5URI.getURI());

            // Read OME-Zarr metadata from group attributes
            // OME-Zarr v0.4 stores multiscales directly in .zattrs (no "ome" wrapper)
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> multiscales = reader.getAttribute(
                    "/", "multiscales", List.class);
            if (multiscales != null && !multiscales.isEmpty()) {
                Map<String, Object> firstMultiscale = multiscales.get(0);

                // Print version
                if (firstMultiscale.containsKey("version")) {
                    System.out.println("  Version: " + firstMultiscale.get("version"));
                }

                // Print name
                if (firstMultiscale.containsKey("name")) {
                    System.out.println("  Name: " + firstMultiscale.get("name"));
                }

                // Print axes
                if (firstMultiscale.containsKey("axes")) {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> axes = (List<Map<String, Object>>) firstMultiscale.get("axes");
                    System.out.print("  Axes: [");
                    for (int i = 0; i < axes.size(); i++) {
                        Map<String, Object> axis = axes.get(i);
                        String name = (String) axis.get("name");
                        String type = axis.containsKey("type") ? (String) axis.get("type") : "null";
                        String unit = axis.containsKey("unit") ? (String) axis.get("unit") : "null";
                        System.out.print("(" + name + ", " + type + ", " + unit + ")");
                        if (i < axes.size() - 1)
                            System.out.print(", ");
                    }
                    System.out.println("]");
                }

                // Print datasets and array metadata
                if (firstMultiscale.containsKey("datasets")) {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> datasets = (List<Map<String, Object>>) firstMultiscale.get("datasets");
                    System.out.print("  Datasets: [");
                    for (int i = 0; i < datasets.size(); i++) {
                        System.out.print(datasets.get(i).get("path"));
                        if (i < datasets.size() - 1)
                            System.out.print(", ");
                    }
                    System.out.println("]");

                    for (Map<String, Object> ds : datasets) {
                        String dsPath = (String) ds.get("path");
                        if (ds.containsKey("coordinateTransformations")) {
                            @SuppressWarnings("unchecked")
                            List<Map<String, Object>> transforms = (List<Map<String, Object>>) ds
                                    .get("coordinateTransformations");
                            for (Map<String, Object> transform : transforms) {
                                if (transform.containsKey("scale")) {
                                    System.out.println("  " + dsPath + " scale: " + transform.get("scale"));
                                }
                                if (transform.containsKey("translation")) {
                                    System.out.println("  " + dsPath + " translation: " + transform.get("translation"));
                                }
                            }
                        }
                        DatasetAttributes attrs = reader.getDatasetAttributes(dsPath);
                        System.out.println("  " + dsPath + " shape:  " + Arrays.toString(attrs.getDimensions()));
                        System.out.println("  " + dsPath + " chunks: " + Arrays.toString(attrs.getBlockSize()));
                        System.out.println("  " + dsPath + " dtype:  " + attrs.getDataType());
                    }
                }
            }

            reader.close();
        } catch (Exception e) {
            System.err.println("Error reading OME-ZARR with n5-universe: " + e.getMessage());
            e.printStackTrace();
        }
    }
}`;
}

export default function getCodeForDataType(
  javaClassName: string,
  dataType: DataLinkType,
  dataLinkUrl: string,
  zarrVersion?: ZarrVersion
) {
  if (dataType === 'directory') {
    return `package org.janelia.fileglancer.example;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;
import org.w3c.dom.Element;
import java.io.ByteArrayInputStream;

public class ListFiles {
        private static final String URL = "${dataLinkUrl}";

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
}`;
  }

  if (dataType === 'n5') {
    return `package org.janelia.fileglancer.example;

import org.janelia.saalfeldlab.n5.DataBlock;
import org.janelia.saalfeldlab.n5.DatasetAttributes;
import org.janelia.saalfeldlab.n5.N5Reader;
import org.janelia.saalfeldlab.n5.N5URI;
import org.janelia.saalfeldlab.n5.universe.N5Factory;
import org.janelia.saalfeldlab.n5.universe.StorageFormat;

import java.util.Arrays;
import java.util.logging.Level;
import java.util.logging.Logger;

public class ReadN5 {
    private static final String URL = "${dataLinkUrl}";

    public static void main(String[] args) throws Exception {
        // Suppress noisy AWS SDK credential-probe warnings (not on EC2)
        Logger.getLogger("com.amazonaws").setLevel(Level.SEVERE);

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
}`;
  }

  // else - zarr and ome-zarr
  return getZarrJavaCode(javaClassName, dataType, dataLinkUrl, zarrVersion);
}
