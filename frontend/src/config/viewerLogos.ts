import fallback_logo from '@/assets/fallback_logo.png';

/**
 * Map of all available logo files in the assets directory
 * This is populated at build time by Vite's glob import
 */
const LOGO_MODULES = import.meta.glob<{ default: string }>('@/assets/*.png', {
  eager: true
});

/**
 * Extract filename from glob import path
 * Converts '/src/assets/neuroglancer.png' to 'neuroglancer.png'
 */
function extractFileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

/**
 * Get logo path for a viewer
 * Logo resolution order:
 * 1. If customLogoPath is provided, use that from @/assets/
 * 2. If not, try to load @/assets/{viewerName}.png
 * 3. If not found, use fallback logo
 *
 * @param viewerName - Name of the viewer (case-insensitive)
 * @param customLogoPath - Optional custom logo filename from config (e.g., "my-logo.png")
 * @returns Logo path to use
 */
export function getViewerLogo(
  viewerName: string,
  customLogoPath?: string
): string {
  const logoFileName = customLogoPath || `${viewerName.toLowerCase()}.png`;

  // Search through available logos
  for (const [path, module] of Object.entries(LOGO_MODULES)) {
    const fileName = extractFileName(path);
    if (fileName === logoFileName) {
      return module.default;
    }
  }

  // If logo not found, return fallback
  return fallback_logo;
}
