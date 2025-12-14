import { default as log } from '@/logger';
import * as zarr from 'zarrita';
import * as omezarr from 'ome-zarr.js';

export type LayerType = 'auto' | 'image' | 'segmentation';

export type Metadata = {
  arr: zarr.Array<any>;
  shapes: number[][] | undefined;
  scales: number[][] | undefined;
  multiscale: omezarr.Multiscale | undefined;
  omero: omezarr.Omero | undefined;
  labels: string[] | undefined;
  zarrVersion: 2 | 3;
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
function getScaleTransform(coordinateTransformations: any[]) {
  return coordinateTransformations?.find((ct: any) => ct.type === 'scale') as {
    scale: number[];
  };
}

/**
 * Calculate resolved scales by multiplying root scales with full scale dataset scales
 * @param multiscale - The multiscale object
 * @param scales - Array of full scale dataset scale values
 * @returns Array of resolved scale values
 */
function getResolvedScales(multiscale: omezarr.Multiscale): number[] {
  // Get the root transform
  const rct = getScaleTransform(multiscale.coordinateTransformations as any[]);
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
function getAxesMap(multiscale: omezarr.Multiscale): Record<string, any> {
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
  multiscale: omezarr.Multiscale,
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
  multiscale: omezarr.Multiscale,
  arr: zarr.Array<any>,
  labels: string[] | undefined,
  omero?: omezarr.Omero | undefined
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
      const minValue = channel.pixel_intensity_min ?? dtypeMin;
      const maxValue = channel.pixel_intensity_max ?? dtypeMax;

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
        shader: getShader(color, minValue, maxValue),
        localDimensions: localDimensions,
        localPosition: [i]
      };

      // Add shader controls if contrast limits are defined
      const start = channel.contrast_limit_start ?? dtypeMin;
      const end = channel.contrast_limit_end ?? dtypeMax;
      if (start !== null && end !== null) {
        layer.shaderControls = {
          normalized: {
            range: [start, end]
          }
        };
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
  multiscale: omezarr.Multiscale,
  arr: zarr.Array<any>,
  labels: string[] | undefined,
  omero?: omezarr.Omero | undefined,
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
  // Normalize omero to undefined if it is null
  const omero2 = omero ?? undefined;
  log.debug(
    'Zarr version: ',
    zarr_version,
    '\nArray: ',
    arr,
    '\nShapes: ',
    shapes,
    '\nMultiscale: ',
    multiscale,
    '\nOmero: ',
    omero2,
    '\nScales: ',
    scales
  );
  const metadata: Metadata = {
    arr,
    shapes,
    scales,
    multiscale,
    omero: omero2,
    labels: undefined,
    zarrVersion: zarr_version
  };

  return metadata;
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
  try {
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
  } catch (error) {
    log.error('Error determining layer type:', error);
  }
  return DEFAULT_LAYER_TYPE;
}

export {
  getScaleTransform,
  getResolvedScales,
  getNeuroglancerSource,
  getZarrArray,
  getOmeZarrMetadata,
  getOmeZarrThumbnail,
  generateNeuroglancerStateForDataURL,
  generateNeuroglancerStateForZarrArray,
  generateNeuroglancerStateForOmeZarr,
  translateUnitToNeuroglancer,
  determineLayerType,
  analyzeThumbnailEdgeContent
};
