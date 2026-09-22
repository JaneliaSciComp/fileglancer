import { default as log } from '@/logger';
import { formatFileSize } from '@/utils';
import * as zarr from 'zarrita';
import * as omezarr from 'ome-zarr.js';
import { classifyCodec } from '@bioimagetools/capability-manifest';
import type {
  OmeZarrMetadata,
  MultiscaleMetadata,
  OmeroMetadata,
  CoordinateTransformation
} from '@bioimagetools/capability-manifest';

export type LayerType = 'auto' | 'image' | 'segmentation';

/**
 * Parsed OME-Zarr metadata plus the runtime handles fileglancer needs for
 * thumbnail and Neuroglancer-state generation (live zarrita array + derived
 * shapes/scales/storage version).
 */
export type Metadata = OmeZarrMetadata & {
  arr: zarr.Array<any>;
  shapes: number[][] | undefined;
  scales: number[][] | undefined;
  zarrVersion: 2 | 3;
};

/**
 * Something about the dataset's layout that will make it awkward to view.
 * Purely advisory - nothing is withheld on account of these.
 */
export type DatasetWarning =
  | { case: 'zarr-single-level'; size: string }
  | {
      case: 'zarr-large-chunks';
      size: string;
      compressed: boolean;
      sharded: boolean;
    };

/**
 * Chunks above this are large enough to slow viewing down: a viewer has to
 * fetch a whole chunk to show any part of it. Applies when the array is stored
 * without compression, so the size we compute is the size that transfers.
 *
 * Published guidance puts the useful range well below this - the image.sc
 * discussion of OME-Zarr chunk sizes lands on 1-10 MB [1], AWS gives 8-16 MB as
 * typical for S3 byte-range reads [2], and webknossos recommends 32^3 to 128^3
 * voxel inner chunks [3]. 32 MB is the top of what anyone recommends, so a chunk
 * past it is outside the range rather than merely on the large side of it.
 *
 * [1] https://forum.image.sc/t/should-compression-play-a-role-in-selecting-chunk-sizes-for-ome-zarr-v0-4-datasets/117877
 * [2] https://d1.awsstatic.com/whitepapers/AmazonS3BestPractices.pdf
 * [3] https://docs.webknossos.org/webknossos/data/zarr.html
 */
export const MAX_CHUNK_BYTES = 32 * 1024 ** 2;
/**
 * The same limit for compressed arrays, where all we can compute is the logical
 * (uncompressed) extent and the real transfer is some unknowable fraction of it.
 * Doubled, so a chunk has to be outside the recommended range even at a
 * conservative 2x ratio before we say anything.
 */
export const MAX_LOGICAL_CHUNK_BYTES = 64 * 1024 ** 2;
/**
 * Below this, a single-level image is small enough that the missing pyramid
 * costs nothing worth mentioning.
 */
export const MAX_SINGLE_LEVEL_BYTES = 1024 ** 3;

/**
 * Whether the array's chunks are compressed on disk.
 *
 * A codec pipeline can nest: a sharded v3 array lists only `sharding_indexed`
 * at the top level and carries the real compressor in its configuration, so the
 * pipeline has to be walked rather than scanned. Anything `classifyCodec` does
 * not recognize counts as compression, and metadata we never fetched counts as
 * compression too - both keep us on the permissive threshold, where the cost of
 * being wrong is a missed warning instead of a false one.
 */
function hasCompressionCodec(codecs: NonNullable<Metadata['codecs']>): boolean {
  return codecs.some(codec => {
    const nested = codec.configuration?.codecs;
    if (Array.isArray(nested) && hasCompressionCodec(nested)) {
      return true;
    }
    return classifyCodec(codec.name) !== 'structural';
  });
}

/**
 * Whether the array is sharded. Worth knowing because zarrita resolves the
 * sharding codec when it opens the array - `arr.chunks` is then the inner chunk
 * shape, the unit a viewer actually fetches, and not the shard around it. The
 * warning says so, since "chunk" alone is ambiguous once sharding is in play.
 */
function isSharded(metadata: Metadata): boolean {
  return (
    metadata.codecs?.some(codec => codec.name === 'sharding_indexed') ?? false
  );
}

function isStoredCompressed(metadata: Metadata): boolean {
  if (metadata.codecs) {
    return hasCompressionCodec(metadata.codecs);
  }
  if (metadata.compressor !== undefined) {
    return metadata.compressor !== null;
  }
  return true;
}

/**
 * Bytes per element for a zarrita dtype. Only numeric dtypes are sized; bool,
 * string and object dtypes fall back to 1, which under-estimates rather than
 * over-warns (they don't occur in imaging data).
 */
function getBytesPerElement(dtype: string): number {
  const bits = Number(/^(?:u?int|float)(\d+)$/.exec(dtype)?.[1]);
  return Number.isFinite(bits) ? bits / 8 : 1;
}

function product(dims: number[]): number {
  return dims.reduce((total, dim) => total * dim, 1);
}

/**
 * Flag layout choices that make a dataset awkward to view.
 *
 * A multiscales group with a single dataset provides no downsampled data, so
 * every zoom level reads full-resolution chunks - the root cause of the incident
 * that prompted these checks.
 *
 * Chunks far above the recommended range slow viewing down, because a viewer has
 * to fetch a whole chunk to show any part of it. Sizes are computed from the
 * shape, so they are logical: exact for an uncompressed array and an upper bound
 * for a compressed one, which is why the limit depends on whether a compressor
 * is in play.
 */
export function getDatasetWarnings(metadata: Metadata): DatasetWarning[] {
  const { arr } = metadata;
  if (!arr) {
    return [];
  }

  const bytesPerElement = getBytesPerElement(arr.dtype);
  const warnings: DatasetWarning[] = [];

  // Declaring multiscales with one dataset is declaring a pyramid and supplying
  // none. Keyed on the dataset count rather than the number of shapes, because
  // a plain zarr array also has exactly one shape and is not making any such
  // claim - `arr` is level 0, so its shape is the full resolution.
  const levels = metadata.multiscales?.[0]?.datasets?.length;
  const fullResBytes = product(arr.shape) * bytesPerElement;
  if (levels === 1 && fullResBytes > MAX_SINGLE_LEVEL_BYTES) {
    warnings.push({
      case: 'zarr-single-level',
      size: formatFileSize(fullResBytes)
    });
  }

  const compressed = isStoredCompressed(metadata);
  const chunkBytes = product(arr.chunks) * bytesPerElement;
  const chunkLimit = compressed ? MAX_LOGICAL_CHUNK_BYTES : MAX_CHUNK_BYTES;
  if (chunkBytes > chunkLimit) {
    warnings.push({
      case: 'zarr-large-chunks',
      size: formatFileSize(chunkBytes),
      compressed,
      sharded: isSharded(metadata)
    });
  }

  return warnings;
}

type OmeZarrChannel = {
  name: string;
  color: string;
  contrast_window: number[] | undefined;
  contrast_range: number[] | undefined;
};

const COLORS = ['magenta', 'green', 'cyan', 'white', 'red', 'yellow', 'blue'];

const UNIT_CONVERSIONS: Record<string, string> = {
  micron: 'um', // Micron is not a valid UDUNITS-2, but some data still uses it
  micrometer: 'um',
  millimeter: 'mm',
  nanometer: 'nm',
  centimeter: 'cm',
  meter: 'm',
  second: 's',
  millisecond: 'ms',
  microsecond: 'us',
  nanosecond: 'ns'
};

const SHADER = `#uicontrol invlerp contrast
#uicontrol vec3 color color
void main() {
  float c = contrast();
  if (VOLUME_RENDERING) {
    emitRGBA(vec4(color * c, c));
  }
  else {
    emitRGB(color * c);
  }
}`;

/**
 * Convert UDUNITS-2 units to Neuroglancer SI units.
 */
function translateUnitToNeuroglancer(unit: string): string {
  if (unit === null || unit === undefined) {
    return '';
  }
  if (UNIT_CONVERSIONS[unit]) {
    return UNIT_CONVERSIONS[unit];
  }
  return unit;
}

/**
 * Find and return the first scale transform from the given coordinate transformations.
 * @param coordinateTransformations - List of coordinate transformations
 * @returns The first transform with type "scale", or undefined if no scale transform is found
 */
function getScaleTransform(
  coordinateTransformations: CoordinateTransformation[] | undefined
) {
  return coordinateTransformations?.find(ct => ct.type === 'scale') as {
    scale: number[];
  };
}

/**
 * Calculate resolved scales by multiplying root scales with full scale dataset scales
 * @param multiscale - The multiscale object
 * @param scales - Array of full scale dataset scale values
 * @returns Array of resolved scale values
 */
function getResolvedScales(multiscale: MultiscaleMetadata): number[] {
  // Get the root transform
  const rct = getScaleTransform(multiscale.coordinateTransformations);
  const rootScales = rct?.scale || [];

  // Get the transform for the full scale dataset
  const dataset = multiscale.datasets[0];
  const ct = getScaleTransform(dataset.coordinateTransformations);
  const scales = ct?.scale || [];

  // Calculate the resolved scales
  return scales.map((scale, index) => scale * (rootScales[index] || 1));
}

/**
 * Get the min and max values for a given Zarr array, based on the dtype:
 * https://zarr-specs.readthedocs.io/en/latest/v2/v2.0.html#data-type-encoding
 */
function getMinMaxValues(arr: zarr.Array<any>): { min: number; max: number } {
  // Default values
  let dtypeMin = 0;
  let dtypeMax = 65535;

  if (arr.dtype) {
    const dtype = arr.dtype;
    log.trace('Parsing dtype:', dtype);
    // Parse numpy-style dtype strings (int8, int16, uint8, etc.)
    if (dtype.includes('int') || dtype.includes('uint')) {
      // Extract the numeric part for bit depth
      const bitMatch = dtype.match(/\d+/);
      if (bitMatch) {
        const bitCount = parseInt(bitMatch[0]);
        if (dtype.startsWith('u')) {
          // Unsigned integer (uint8, uint16, etc.)
          log.trace('Unsigned integer');
          dtypeMin = 0;
          dtypeMax = 2 ** bitCount - 1;
        } else {
          // Signed integer (int8, int16, etc.)
          log.trace('Signed integer');
          dtypeMin = -(2 ** (bitCount - 1));
          dtypeMax = 2 ** (bitCount - 1) - 1;
        }
      } else {
        // Try explicit endianness format: <byteorder><type><bytes>
        const oldFormatMatch = dtype.match(/^[<>|]([iuf])(\d+)$/);
        if (oldFormatMatch) {
          const typeCode = oldFormatMatch[1];
          const bytes = parseInt(oldFormatMatch[2], 10);
          const bitCount = bytes * 8;
          if (typeCode === 'i') {
            // Signed integer
            log.trace('Signed integer');
            dtypeMin = -(2 ** (bitCount - 1));
            dtypeMax = 2 ** (bitCount - 1) - 1;
          } else if (typeCode === 'u') {
            // Unsigned integer
            log.trace('Unsigned integer');
            dtypeMin = 0;
            dtypeMax = 2 ** bitCount - 1;
          }
        } else {
          log.warn('Could not determine min/max values for dtype: ', dtype);
        }
      }
    } else {
      log.warn('Unrecognized dtype format: ', dtype);
    }
  }

  return { min: dtypeMin, max: dtypeMax };
}

/**
 * Get a map of axes names to their details.
 */
function getAxesMap(multiscale: MultiscaleMetadata): Record<string, any> {
  const axesMap: Record<string, any> = {};
  const axes = multiscale.axes;
  if (axes) {
    axes.forEach((axis, i) => {
      axesMap[axis.name] = { ...axis, index: i };
    });
  }
  return axesMap;
}

/**
 * Get the Neuroglancer source for a given Zarr array.
 */
function getNeuroglancerSource(dataUrl: string, zarrVersion: 2 | 3): string {
  // Neuroglancer expects a trailing slash
  const normalizedDataUrl = dataUrl + (dataUrl.endsWith('/') ? '' : '/');
  return normalizedDataUrl + '|zarr' + zarrVersion + ':';
}

/**
 * Get the layer name for a given URL, the same way that Neuroglancer does it.
 */
function getLayerName(dataUrl: string): string {
  // Get the last component of the URL after the final slash (filter(Boolean) discards empty strings)
  return dataUrl.split('/').filter(Boolean).pop() || 'Default';
}

function generateNeuroglancerStateForDataURL(
  dataUrl: string,
  zarrVersion: 2 | 3
): string {
  log.debug('Generating Neuroglancer state for Zarr array:', dataUrl);
  const layer: Record<string, any> = {
    name: getLayerName(dataUrl),
    source: getNeuroglancerSource(dataUrl, zarrVersion),
    type: 'new'
  };

  // The intent of this state is to reproduce the behavior of the Neuroglancer viewer
  // when a URL is pasted into source input.
  const state: any = {
    layers: [layer],
    selectedLayer: {
      visible: true,
      layer: layer.name
    },
    layout: '4panel-alt'
  };

  // Convert the state to a URL-friendly format
  const stateJson = JSON.stringify(state);
  return encodeURIComponent(stateJson);
}

function generateNeuroglancerStateForZarrArray(
  dataUrl: string,
  zarrVersion: 2 | 3,
  layerType: LayerType
): string {
  log.debug('Generating Neuroglancer state for Zarr array:', dataUrl);

  const layer: Record<string, any> = {
    name: getLayerName(dataUrl),
    type: layerType,
    source: getNeuroglancerSource(dataUrl, zarrVersion),
    tab: 'rendering'
  };

  // Create the scaffold for theNeuroglancer viewer state
  const state: any = {
    layers: [layer],
    selectedLayer: {
      visible: true,
      layer: layer.name
    },
    layout: '4panel-alt'
  };

  // Convert the state to a URL-friendly format
  const stateJson = JSON.stringify(state);
  return encodeURIComponent(stateJson);
}

/**
 * Generate a simple Neuroglancer state for a given Zarr array.
 */
function generateSimpleNeuroglancerStateForOmeZarr(
  dataUrl: string,
  zarrVersion: 2 | 3,
  layerType: LayerType,
  multiscale: MultiscaleMetadata,
  arr: zarr.Array<any>
): string {
  log.debug('Generating simple Neuroglancer state for OME-Zarr:', dataUrl);

  // Convert axes array to a map for easier access
  const axesMap = getAxesMap(multiscale);
  log.debug('Axes map: ', axesMap);

  // Determine the layout based on the z-axis
  let layout = '4panel-alt';
  if ('z' in axesMap) {
    const zAxisIndex = axesMap['z'].index;
    const zDimension = arr.shape[zAxisIndex];
    if (zDimension === 1) {
      layout = 'xy';
    }
  }

  // Consider this a segmentation if the layer type is segmentation
  // AND there is no channel axis or the channel axis has only one channel
  const type =
    layerType === 'segmentation' &&
    (!axesMap['c'] || arr.shape[axesMap['c']?.index] === 1)
      ? 'segmentation'
      : 'auto';

  const state = {
    layers: [
      {
        name: getLayerName(dataUrl),
        source: getNeuroglancerSource(dataUrl, zarrVersion),
        type
      }
    ],
    layout: layout
  };

  log.debug('Simple Neuroglancer state: ', state);

  // Convert the state to a URL-friendly format
  const stateJson = JSON.stringify(state);
  return encodeURIComponent(stateJson);
}

/**
 * Generate a Neuroglancer state for a given Zarr array.
 */
function generateFullNeuroglancerStateForOmeZarr(
  dataUrl: string,
  zarrVersion: 2 | 3,
  layerType: LayerType,
  multiscale: MultiscaleMetadata,
  arr: zarr.Array<any>,
  labels: string[] | undefined,
  omero?: OmeroMetadata | undefined
): string | null {
  if (!multiscale || !arr) {
    throw new Error(
      'Missing required metadata for Neuroglancer state generation: multiscale=' +
        multiscale +
        ', arr=' +
        arr +
        ', omero=' +
        omero
    );
  }
  log.debug('Generating Neuroglancer state for OME-Zarr:', dataUrl);

  // Convert axes array to a map for easier access
  const axesMap = getAxesMap(multiscale);
  log.debug('Axes map: ', axesMap);

  // Determine the layout based on the z-axis
  let layout = '4panel-alt';
  if ('z' in axesMap) {
    const zAxisIndex = axesMap['z'].index;
    const zDimension = arr.shape[zAxisIndex];
    if (zDimension === 1) {
      layout = 'xy';
    }
  }

  const { min: dtypeMin, max: dtypeMax } = getMinMaxValues(arr);
  log.debug('Inferred min/max values:', dtypeMin, dtypeMax);

  const defaultLayerName = getLayerName(dataUrl);

  // Create the scaffold for the Neuroglancer viewer state
  const state: any = {
    dimensions: {},
    layers: [],
    selectedLayer: {
      layer: defaultLayerName
    },
    layout: layout
  };

  if (layerType === 'segmentation') {
    state.selectedLayer.visible = true;
  } else {
    // Add the shader controls tool palette for images
    state.toolPalettes = {
      'Shader controls': {
        side: 'left',
        row: 3,
        query: 'type:shaderControl'
      }
    };
  }

  const scales = getResolvedScales(multiscale);

  // Set up Neuroglancer dimensions with the expected order
  const dimensionNames = ['x', 'y', 'z', 't'];
  const imageDimensions = new Set(Object.keys(axesMap));
  for (const name of dimensionNames) {
    if (axesMap[name]) {
      const axis = axesMap[name];
      const unit = translateUnitToNeuroglancer(axis.unit);
      state.dimensions[name] = [scales[axis.index], unit];
      imageDimensions.delete(name);
    } else {
      log.trace('Dimension not found in axes map: ', name);
    }
  }

  log.debug('Dimensions: ', state.dimensions);

  // Remove the channel dimension, which will be handled by layers
  imageDimensions.delete('c');
  // Log any unused dimensions
  if (imageDimensions.size > 0) {
    log.warn('Unused dimensions: ', Array.from(imageDimensions));
  }

  const sourceUrl = getNeuroglancerSource(dataUrl, zarrVersion);

  let colorIndex = 0;
  const channels = [];
  if (omero && omero.channels) {
    log.debug('Omero channels: ', omero.channels);
    for (let i = 0; i < omero.channels.length; i++) {
      const channelMeta = omero.channels[i];
      const window = channelMeta.window || {};
      const channel: OmeZarrChannel = {
        name: (channelMeta.label as string) || `Ch${i}`,
        color: channelMeta.color || COLORS[colorIndex++ % COLORS.length],
        contrast_window: undefined,
        contrast_range: undefined
      };
      if (window.min || window.max) {
        channel.contrast_window = [
          window.min ?? dtypeMin,
          window.max ?? dtypeMax
        ];
      }
      if (window.start || window.end) {
        channel.contrast_range = [
          window.start ?? (window.min || dtypeMin),
          window.end ?? (window.max || dtypeMax)
        ];
      }
      channels.push(channel);
    }
  } else {
    // If there is no omero metadata, try to infer channels from the axes
    if ('c' in axesMap) {
      const channelAxis = axesMap['c'].index;
      const numChannels = arr.shape[channelAxis];
      for (let i = 0; i < numChannels; i++) {
        channels.push({
          name: `Ch${i}`,
          color: COLORS[colorIndex++ % COLORS.length],
          contrast_range: [dtypeMin, dtypeMax],
          contrast_window: [dtypeMin, dtypeMax]
        });
      }
    }
  }

  if (channels.length === 0) {
    log.trace('No channels found in metadata, using default shader');
    const layer: Record<string, any> = {
      name: defaultLayerName,
      type: layerType,
      source: sourceUrl,
      tab: 'rendering',
      opacity: 1,
      blend: 'additive',
      shaderControls: {
        normalized: {
          range: [dtypeMin, dtypeMax]
        }
      }
    };
    state.layers.push(layer);
  } else {
    // If there is only one channel, make it white
    if (channels.length === 1) {
      channels[0].color = 'white';
    }

    // Add layers for each channel
    channels.forEach((channel, i) => {
      // Format color
      let color = channel.color;
      if (/^[\dA-F]{6}$/.test(color)) {
        // Bare hex color, add leading hash for rendering
        color = '#' + color;
      }

      const channelUnit = translateUnitToNeuroglancer(axesMap['c'].unit);
      const localDimensions = { "c'": [1, channelUnit] };
      const transform = { outputDimensions: localDimensions };

      const layer: Record<string, any> = {
        name: channel.name,
        type: layerType,
        source: {
          url: sourceUrl,
          transform
        },
        tab: 'rendering',
        archived: i >= 4, // Archive layers after the first 4
        opacity: 1,
        blend: 'additive',
        shader: SHADER,
        shaderControls: {
          color: color
        },
        localDimensions: localDimensions,
        localPosition: [i]
      };

      if (channel.contrast_range) {
        if (!layer.shaderControls.contrast) {
          layer.shaderControls.contrast = {};
        }
        layer.shaderControls.contrast.range = channel.contrast_range;
      }

      if (channel.contrast_window) {
        if (!layer.shaderControls.contrast) {
          layer.shaderControls.contrast = {};
        }
        layer.shaderControls.contrast.window = channel.contrast_window;
      }

      state.layers.push(layer);
    });

    // Show the layer list panel if there are more than 4 channels
    if (channels.length > 4) {
      state.layerListPanel = {
        visible: true
      };
    }

    // Fix the selected layer name
    state.selectedLayer.layer = channels[0].name;
  }

  // Add layer for each label
  if (labels) {
    labels.forEach(label => {
      const layer: Record<string, any> = {
        name: label,
        source: sourceUrl + '/labels/' + label,
        type: 'segmentation'
      };
      state.layers.push(layer);
    });
  }

  log.debug('Neuroglancer state: ', state);

  // Convert the state to a URL-friendly format
  const stateJson = JSON.stringify(state);
  return encodeURIComponent(stateJson);
}

/**
 * Generate a Neuroglancer state for a given Zarr array.
 */
function generateNeuroglancerStateForOmeZarr(
  dataUrl: string,
  zarrVersion: 2 | 3,
  layerType: LayerType,
  multiscale: MultiscaleMetadata,
  arr: zarr.Array<any>,
  labels: string[] | undefined,
  omero?: OmeroMetadata | undefined,
  useLegacyMultichannelApproach: boolean = false
): string | null {
  // If there are labels or user requested legacy multichannel approach, use the complex version
  if (labels || useLegacyMultichannelApproach) {
    return generateFullNeuroglancerStateForOmeZarr(
      dataUrl,
      zarrVersion,
      layerType,
      multiscale,
      arr,
      labels,
      omero
    );
  }

  // Otherwise use the simpler version
  return generateSimpleNeuroglancerStateForOmeZarr(
    dataUrl,
    zarrVersion,
    layerType,
    multiscale,
    arr
  );
}

async function getZarrArray(
  dataUrl: string,
  zarrVersion: 2 | 3
): Promise<zarr.Array<any>> {
  const store = new zarr.FetchStore(dataUrl, {
    overrides: {
      credentials: 'include'
    }
  });
  return await omezarr.getArray(store, '/', zarrVersion);
}

/**
 * Process the given OME-Zarr array and return the metadata, thumbnail, and Neuroglancer link.
 */
async function getOmeZarrMetadata(dataUrl: string): Promise<Metadata> {
  const store = new zarr.FetchStore(dataUrl, {
    overrides: {
      credentials: 'include'
    }
  });
  const { arr, shapes, multiscale, omero, scales, zarr_version } =
    await omezarr.getMultiscaleWithArray(store, 0);

  // ome-zarr.js returns a single `multiscale` with its own, looser types.
  // Normalize it once here, at the ingestion boundary, into the canonical
  // OmeZarrMetadata shape (multiscales array + top-level axes) so downstream
  // code can use `Metadata` as an `OmeZarrMetadata` without ever recasting.
  const normalizedMultiscale = multiscale
    ? (multiscale as unknown as MultiscaleMetadata)
    : undefined;
  const omero2 = (omero ?? undefined) as OmeroMetadata | undefined;

  log.debug(
    'Zarr version: ',
    zarr_version,
    '\nArray: ',
    arr,
    '\nShapes: ',
    shapes,
    '\nMultiscale: ',
    normalizedMultiscale,
    '\nOmero: ',
    omero2,
    '\nScales: ',
    scales
  );
  const metadata: Metadata = {
    arr,
    shapes,
    scales,
    zarrVersion: zarr_version,
    multiscales: normalizedMultiscale ? [normalizedMultiscale] : undefined,
    axes: normalizedMultiscale?.axes,
    omero: omero2,
    labels: undefined
  };

  return metadata;
}

/**
 * Open a plain Zarr array (not an OME-Zarr multiscale group) with auto-detected
 * storage version and emit a single-layer Neuroglancer state. Used by the Views
 * checkout when a cart dataset is a bare array, so each added directory still
 * becomes one layer.
 */
/**
 * Guess a Neuroglancer layer type for a plain array from its name and dtype.
 * Label/segmentation volumes are integer-typed and usually named seg/label/mask;
 * everything else is treated as an image. This only sets the default so the
 * layer resolves without Neuroglancer's "new layer" type picker — the user can
 * still switch the type in the viewer.
 */
function guessPlainLayerType(dataUrl: string, dtype: string): LayerType {
  const name = getLayerName(dataUrl).toLowerCase();
  const isInteger = /^(u?int)/.test(dtype);
  if (isInteger && /seg|label|mask/.test(name)) {
    return 'segmentation';
  }
  return 'image';
}

async function generateStateForPlainZarr(dataUrl: string): Promise<string> {
  // Probe the storage version (needed for the |zarrN: source suffix): try v2
  // first (most fileglancer data), then v3. If neither opens, this throws and
  // the caller skips the dataset.
  let zarrVersion: 2 | 3 = 2;
  let arr;
  try {
    arr = await getZarrArray(dataUrl, 2);
  } catch {
    arr = await getZarrArray(dataUrl, 3);
    zarrVersion = 3;
  }
  const layerType = guessPlainLayerType(dataUrl, String(arr.dtype));
  return generateNeuroglancerStateForZarrArray(dataUrl, zarrVersion, layerType);
}

/**
 * Get the channel labels for an OME-Zarr dataset: from `omero.channels[].label`
 * when present, else synthesized `Channel 0..n-1` from the `c` axis length,
 * else `[]` when there is no channel axis.
 */
async function getOmeZarrChannels(dataUrl: string): Promise<string[]> {
  let metadata;
  try {
    metadata = await getOmeZarrMetadata(dataUrl);
  } catch {
    // Plain array / no multiscale group: no channels to enumerate. Return []
    // instead of throwing so the cart row shows its no-channel hint.
    return [];
  }
  const multiscale = metadata.multiscales?.[0];
  if (!multiscale) {
    return [];
  }
  if (metadata.omero?.channels?.length) {
    return metadata.omero.channels.map((ch, i) => ch.label || `Channel ${i}`);
  }
  const axesMap = getAxesMap(multiscale);
  const cAxis = axesMap['c'];
  if (!cAxis) {
    return [];
  }
  const count = metadata.arr.shape[cAxis.index];
  return Array.from({ length: count }, (_, i) => `Channel ${i}`);
}

type ThumbnailResult = [thumbnail: string | null, errorMessage: string | null];

async function getOmeZarrThumbnail(
  dataUrl: string,
  signal: AbortSignal,
  thumbnailSize: number = 300,
  maxThumbnailSize: number = 1024,
  autoBoost: boolean = true
): Promise<ThumbnailResult> {
  const store = new zarr.FetchStore(dataUrl, {
    overrides: {
      credentials: 'include',
      signal
    }
  });
  try {
    return [
      await omezarr.renderThumbnail(
        store,
        thumbnailSize,
        autoBoost,
        maxThumbnailSize
      ),
      null
    ];
  } catch (err: unknown) {
    let errorMessage: string | null = null;
    if (err instanceof Error) {
      errorMessage = err.message;
    } else {
      errorMessage = String(err);
    }
    return [null, errorMessage];
  }
}

/**
 * Analyzes edge content in a thumbnail by shifting it 1 pixel to the right,
 * subtracting from the original, and calculating the ratio of non-zero pixels.
 * @param thumbnailDataUrl - Base64 data URL of the thumbnail image
 * @returns Promise<number> - The ratio of edge pixels to total pixels
 */
async function analyzeThumbnailEdgeContent(
  thumbnailDataUrl: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Get original image data
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const origData = ctx.getImageData(0, 0, img.width, img.height);

        // Clear canvas and draw shifted image (1 pixel to the right)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 1, 0);
        const shiftData = ctx.getImageData(0, 0, img.width, img.height);

        let nonZeroPixels = 0;
        const totalPixels = img.width * img.height;

        // Compare original and shifted images pixel by pixel
        for (let i = 0; i < origData.data.length; i += 4) {
          // Calculate difference for RGB channels (ignore alpha)
          const rDiff = Math.abs(origData.data[i] - shiftData.data[i]);
          const gDiff = Math.abs(origData.data[i + 1] - shiftData.data[i + 1]);
          const bDiff = Math.abs(origData.data[i + 2] - shiftData.data[i + 2]);

          // If any channel has a significant difference, count as edge pixel
          if (rDiff > 0 || gDiff > 0 || bDiff > 0) {
            nonZeroPixels++;
          }
        }

        const edgeRatio = nonZeroPixels / totalPixels;

        log.debug(
          `Edge detection analysis: found ${nonZeroPixels} edge pixels out of ${totalPixels} total pixels`
        );
        resolve(edgeRatio);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load thumbnail image'));
    };

    img.src = thumbnailDataUrl;
  });
}

/**
 * Determines the layer type for the given OME-Zarr metadata.
 * If heuristical detection is disabled, returns "image".
 * Uses thumbnail edge detection to determine if data is segmentation or image.
 *
 * @param useHeuristicalDetection - If true, skip heuristical detection and return "image"
 * @param thumbnailDataUrl - Optional thumbnail data URL for edge content analysis
 * @returns Promise<LayerType> - The determined layer type
 */
async function determineLayerType(
  useHeuristicalDetection = true,
  thumbnailDataUrl?: string | null
): Promise<LayerType> {
  const DEFAULT_LAYER_TYPE = 'image';
  if (!useHeuristicalDetection) {
    log.debug('Heuristical layer type detection is disabled');
  } else if (thumbnailDataUrl) {
    try {
      const edgeRatio = await analyzeThumbnailEdgeContent(thumbnailDataUrl);
      log.debug('Thumbnail edge detection ratio:', edgeRatio);
      // Segmentation data typically has low edge ratio
      const layerType =
        edgeRatio > 0.0 && edgeRatio < 0.05 ? 'segmentation' : 'image';
      log.debug(`Layer type set to ${layerType} based on edge analysis`);
      return layerType;
    } catch (error) {
      log.error('Failed to analyze thumbnail edge content:', error);
    }
  } else {
    log.debug('No thumbnail available, returning image');
  }
  return DEFAULT_LAYER_TYPE;
}

export {
  getScaleTransform,
  getResolvedScales,
  getAxesMap,
  getNeuroglancerSource,
  getZarrArray,
  getOmeZarrMetadata,
  getOmeZarrChannels,
  getOmeZarrThumbnail,
  generateNeuroglancerStateForDataURL,
  generateStateForPlainZarr,
  generateNeuroglancerStateForZarrArray,
  generateNeuroglancerStateForOmeZarr,
  translateUnitToNeuroglancer,
  determineLayerType,
  analyzeThumbnailEdgeContent
};
