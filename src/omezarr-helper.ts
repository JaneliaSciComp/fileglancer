import { default as log } from '@/logger';
import * as zarr from 'zarrita';
import * as omezarr from 'ome-zarr.js';

// Copied since ome-zarr.js doesn't export the types
// TODO: use the types from ome-zarr.js when they become available
export interface Multiscale {
  axes: Axis[];
  /**
   * @minItems 1
   */
  datasets: [Dataset, ...Dataset[]];
  version?: '0.4' | null;
  coordinateTransformations?: [unknown] | [unknown, unknown] | null;
  metadata?: {
    [k: string]: unknown;
  };
  name?: unknown;
  type?: {
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
/**
 * Model for an element of `Multiscale.axes`.
 *
 * See https://ngff.openmicroscopy.org/0.4/#axes-md.
 */
export interface Axis {
  name: string;
  type?: string | null;
  unit?: unknown;
  [k: string]: unknown;
}
/**
 * An element of Multiscale.datasets.
 */
export interface Dataset {
  path: string;
  coordinateTransformations: [unknown] | [unknown, unknown];
  [k: string]: unknown;
}
/**
 * omero model.
 */
export interface Omero {
  channels: Channel[];
  rdefs: {
    defaultT: number;
    defaultZ: number;
    model: 'greyscale' | 'color';
  };
  [k: string]: unknown;
}
/**
 * A single omero channel.
 */
export interface Channel {
  color: string;
  window: Window;
  lut?: string;
  active?: boolean;
  inverted?: boolean;
  [k: string]: unknown;
}
/**
 * A single window.
 */
export interface Window {
  max: number;
  min: number;
  start?: number;
  end?: number;
  [k: string]: unknown;
}

export type Metadata = {
  arr: zarr.Array<any>;
  shapes: number[][] | undefined;
  multiscale: Multiscale;
  omero: Omero | null | undefined;
  scales: number[][];
  zarr_version: 2 | 3;
};

const COLORS = ['magenta', 'green', 'cyan', 'white', 'red', 'green', 'blue'];

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
 * Generate a Neuroglancer shader for a given color and min/max values.
 */
function getShader(color: string, minValue: number, maxValue: number): string {
  return `#uicontrol vec3 hue color(default="${color}")
#uicontrol invlerp normalized(range=[${minValue},${maxValue}])
void main(){emitRGBA(vec4(hue*normalized(),1));}`;
}

/**
 * Get a map of axes names to their details.
 */
function getAxesMap(multiscale: Multiscale): Record<string, any> {
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
function getNeuroglancerSource(dataUrl: string, zarr_version: 2 | 3): string {
  // Neuroglancer expects a trailing slash
  if (!dataUrl.endsWith('/')) {
    dataUrl = dataUrl + '/';
  }
  return dataUrl + '|zarr' + zarr_version + ':';
}

function generateNeuroglancerStateForZarrArray(
  dataUrl: string,
  zarr_version: 2 | 3
): string | null {
  log.debug('Generating Neuroglancer state for Zarr array:', dataUrl);

  const layer: Record<string, any> = {
    name: 'Default',
    type: 'image',
    source: getNeuroglancerSource(dataUrl, zarr_version),
    tab: 'rendering'
  };

  // Create the scaffold for theNeuroglancer viewer state
  const state: any = {
    layers: [layer],
    layout: '4panel',
    selectedLayer: {
      visible: true,
      layer: 'Default'
    }
  };

  // Convert the state to a URL-friendly format
  const stateJson = JSON.stringify(state);
  return encodeURIComponent(stateJson);
}

/**
 * Generate a Neuroglancer state for a given Zarr array.
 */
function generateNeuroglancerStateForOmeZarr(
  dataUrl: string,
  zarr_version: 2 | 3,
  multiscale: Multiscale,
  arr: zarr.Array<any>,
  omero?: Omero | null
): string | null {
  log.debug('Generating Neuroglancer state for OME-Zarr:', dataUrl);

  // Convert axes array to a map for easier access
  const axesMap = getAxesMap(multiscale);
  log.debug('Axes map: ', axesMap);

  const { min: dtypeMin, max: dtypeMax } = getMinMaxValues(arr);
  log.debug('Inferred min/max values:', dtypeMin, dtypeMax);

  // Create the scaffold for theNeuroglancer viewer state
  const state: any = {
    dimensions: {},
    layers: [],
    layout: '4panel',
    selectedLayer: {
      visible: true,
      layer: 'Default'
    }
  };

  const fullres = multiscale.datasets[0];
  // TODO: handle multiple scale transformations
  const scaleTransform: any = fullres.coordinateTransformations?.find(
    (t: any) => t.type === 'scale'
  );
  if (!scaleTransform) {
    log.error('No scale transformation found in the full scale dataset');
    return null;
  }
  const scale = scaleTransform.scale;

  // Set up Neuroglancer dimensions with the expected order
  const dimensionNames = ['x', 'y', 'z', 't'];
  const imageDimensions = new Set(Object.keys(axesMap));
  for (const name of dimensionNames) {
    if (axesMap[name]) {
      const axis = axesMap[name];
      const unit = translateUnitToNeuroglancer(axis.unit);
      state.dimensions[name] = [scale[axis.index], unit];
      imageDimensions.delete(name);
    } else {
      log.debug('Dimension not found in axes map: ', name);
    }
  }

  log.debug('Dimensions: ', state.dimensions);

  // Remove the channel dimension, which will be handled by layers
  imageDimensions.delete('c');
  // Log any unused dimensions
  if (imageDimensions.size > 0) {
    log.warn('Unused dimensions: ', Array.from(imageDimensions));
  }

  let colorIndex = 0;
  const channels = [];
  if (omero && omero.channels) {
    log.debug('Omero channels: ', omero.channels);
    for (let i = 0; i < omero.channels.length; i++) {
      const channelMeta = omero.channels[i];
      const window = channelMeta.window || {};
      channels.push({
        name: channelMeta.label || `Ch${i}`,
        color: channelMeta.color || COLORS[colorIndex++ % COLORS.length],
        pixel_intensity_min: window.min,
        pixel_intensity_max: window.max,
        contrast_limit_start: window.start,
        contrast_limit_end: window.end
      });
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
          pixel_intensity_min: dtypeMin,
          pixel_intensity_max: dtypeMax,
          contrast_limit_start: dtypeMin,
          contrast_limit_end: dtypeMax
        });
      }
    }
  }

  if (channels.length === 0) {
    log.debug('No channels found in metadata, using default shader');
    const layer: Record<string, any> = {
      type: 'image',
      source: getNeuroglancerSource(dataUrl, zarr_version),
      tab: 'rendering',
      opacity: 1,
      blend: 'additive',
      shaderControls: {
        normalized: {
          range: [dtypeMin, dtypeMax]
        }
      }
    };
    state.layers.push({
      name: 'Default',
      ...layer
    });
  } else {
    // If there is only one channel, make it white
    if (channels.length === 1) {
      channels[0].color = 'white';
    }

    // Add layers for each channel
    channels.forEach((channel, i) => {
      const minValue = channel.pixel_intensity_min ?? dtypeMin;
      const maxValue = channel.pixel_intensity_max ?? dtypeMax;

      // Format color
      let color = channel.color;
      if (/^[\dA-F]{6}$/.test(color)) {
        // Bare hex color, add leading hash for rendering
        color = '#' + color;
      }

      const layer: Record<string, any> = {
        type: 'image',
        source: getNeuroglancerSource(dataUrl, zarr_version),
        tab: 'rendering',
        opacity: 1,
        blend: 'additive',
        shader: getShader(color, minValue, maxValue),
        localDimensions: { "c'": [1, ''] },
        localPosition: [i]
      };

      // Add shader controls if contrast limits are defined
      const start = channel.contrast_limit_start ?? dtypeMin;
      const end = (channel.contrast_limit_end ?? dtypeMax) * 0.25;
      if (start !== null && end !== null) {
        layer.shaderControls = {
          normalized: {
            range: [start, end]
          }
        };
      }

      state.layers.push({
        name: channel.name,
        ...layer
      });
    });

    // Fix the selected layer name
    state.selectedLayer.layer = channels[0].name;
  }

  // Convert the state to a URL-friendly format
  const stateJson = JSON.stringify(state);
  return encodeURIComponent(stateJson);
}

async function getZarrArray(dataUrl: string): Promise<zarr.Array<any>> {
  log.debug('Getting Zarr array for', dataUrl);
  const zarr_version = 2;
  const store = new zarr.FetchStore(dataUrl);
  return await omezarr.getArray(store, '/', zarr_version);
}

/**
 * Process the given OME-Zarr array and return the metadata, thumbnail, and Neuroglancer link.
 */
async function getOmeZarrMetadata(dataUrl: string): Promise<Metadata> {
  log.debug('Getting OME-Zarr metadata for', dataUrl);
  const store = new zarr.FetchStore(dataUrl);
  const { arr, shapes, multiscale, omero, scales, zarr_version } =
    await omezarr.getMultiscaleWithArray(store, 0);
  log.debug('Zarr version: ', zarr_version);
  log.debug('Multiscale: ', multiscale);
  log.debug('Omero: ', omero);
  log.debug('Array: ', arr);
  log.debug('Shapes: ', shapes);

  const metadata: Metadata = {
    arr,
    shapes,
    multiscale,
    omero,
    scales,
    zarr_version
  };

  return metadata;
}

type ThumbnailResult = [thumbnail: string | null, errorMessage: string | null];

async function getOmeZarrThumbnail(
  dataUrl: string,
  thumbnailSize: number = 300,
  maxThumbnailSize: number = 1024,
  autoBoost: boolean = true
): Promise<ThumbnailResult> {
  log.debug('Getting OME-Zarr thumbnail for', dataUrl);
  const store = new zarr.FetchStore(dataUrl);
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

export {
  getZarrArray,
  getOmeZarrMetadata,
  getOmeZarrThumbnail,
  generateNeuroglancerStateForZarrArray,
  generateNeuroglancerStateForOmeZarr
};
