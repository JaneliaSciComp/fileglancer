/**
 * Neuroglancer URL parsing and validation utilities
 * Mirrors backend validation logic for client-side validation
 */

export type ParsedNeuroglancerUrl = {
  success: true;
  urlBase: string;
  state: Record<string, unknown>;
};

export type NeuroglancerParseError = {
  success: false;
  error: string;
};

export type JsonValidationResult =
  | { success: true; state: Record<string, unknown> }
  | { success: false; error: string };

/**
 * Parse a Neuroglancer URL and extract the base URL and state
 * Validates that the URL is properly formatted and contains valid JSON state
 */
export function parseNeuroglancerUrl(
  url: string
): ParsedNeuroglancerUrl | NeuroglancerParseError {
  const trimmedUrl = url.trim();

  // Check for #! separator
  if (!trimmedUrl.includes('#!')) {
    return {
      success: false,
      error: 'URL must contain "#!" separator'
    };
  }

  // Split URL into base and encoded state
  const [urlBase, encodedState] = trimmedUrl.split('#!');

  // Validate base URL starts with http:// or https://
  if (!urlBase.startsWith('http://') && !urlBase.startsWith('https://')) {
    return {
      success: false,
      error: 'Base URL must start with http:// or https://'
    };
  }

  if (!encodedState) {
    return {
      success: false,
      error: 'URL must contain state after "#!"'
    };
  }

  // Decode the state
  let decodedState: string;
  try {
    decodedState = decodeURIComponent(encodedState);
  } catch {
    return {
      success: false,
      error: 'Failed to decode URL state'
    };
  }

  // Parse JSON
  let state: unknown;
  try {
    state = JSON.parse(decodedState);
  } catch {
    return {
      success: false,
      error:
        'Invalid Neuroglancer state (likely truncated). Please copy the state JSON directly instead of the URL.'
    };
  }

  // Validate state is an object
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    return {
      success: false,
      error: 'Neuroglancer state must be a JSON object'
    };
  }

  return {
    success: true,
    urlBase,
    state: state as Record<string, unknown>
  };
}

/**
 * Validate a JSON string represents a valid Neuroglancer state
 * State must be a JSON object (not array or primitive)
 */
export function validateJsonState(jsonString: string): JsonValidationResult {
  const trimmed = jsonString.trim();

  if (!trimmed) {
    return {
      success: false,
      error: 'JSON state is required'
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      success: false,
      error: 'Invalid JSON syntax'
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      success: false,
      error: 'State must be a JSON object (not array or primitive)'
    };
  }

  return {
    success: true,
    state: parsed as Record<string, unknown>
  };
}

/**
 * Normalize a JSON string to compact format
 * Parses and re-stringifies to ensure consistent formatting
 */
export function normalizeJsonString(jsonString: string): string {
  const parsed = JSON.parse(jsonString);
  return JSON.stringify(parsed);
}

/**
 * Construct a Neuroglancer URL from state and base URL
 */
export function constructNeuroglancerUrl(
  state: Record<string, unknown>,
  baseUrl: string
): string {
  const encodedState = encodeURIComponent(JSON.stringify(state));
  return `${baseUrl}#!${encodedState}`;
}
