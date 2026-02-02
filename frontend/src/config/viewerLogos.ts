import fallback_logo from '@/assets/fallback_logo.png';

/**
 * Fallback logo for viewers without a specified logo
 */
export const FALLBACK_LOGO = fallback_logo;

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

  try {
    // Try to dynamically import the logo from assets
    // This will be resolved at build time by Vite
    const logo = new URL(`../assets/${logoFileName}`, import.meta.url).href;
    return logo;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    // If logo not found, return fallback
    return FALLBACK_LOGO;
  }
}
