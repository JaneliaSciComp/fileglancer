/**
 * OZX (Zipped OME-Zarr) file detection utilities.
 *
 * RFC-9 Spec: https://ngff.openmicroscopy.org/rfc/9/index.html
 */

import type { FileOrFolder } from '@/shared.types';

/**
 * Check if a file is an OZX (Zipped OME-Zarr) file by extension.
 *
 * @param file - The file to check
 * @returns True if the file has a .ozx extension
 */
export function isOzxFile(file: FileOrFolder): boolean {
  return !file.is_dir && file.name.toLowerCase().endsWith('.ozx');
}

/**
 * Check if a filename has the .ozx extension.
 *
 * @param filename - The filename to check
 * @returns True if the filename ends with .ozx
 */
export function isOzxFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith('.ozx');
}

/**
 * Check if a file is a regular ZIP file by extension.
 *
 * @param file - The file to check
 * @returns True if the file has a .zip extension
 */
export function isZipFile(file: FileOrFolder): boolean {
  return !file.is_dir && file.name.toLowerCase().endsWith('.zip');
}

/**
 * Check if a file is either an OZX or a ZIP file.
 *
 * @param file - The file to check
 * @returns True if the file is an OZX or a ZIP file
 */
export function isAnyZipFile(file: FileOrFolder): boolean {
  return isOzxFile(file) || isZipFile(file);
}

/**
 * Check if a list of files contains any OZX files.
 *
 * @param files - Array of files to check
 * @returns True if at least one file is an OZX file
 */
export function hasOzxFiles(files: FileOrFolder[]): boolean {
  return files.some(isOzxFile);
}

/**
 * Get all OZX files from a list of files.
 *
 * @param files - Array of files to filter
 * @returns Array containing only the OZX files
 */
export function getOzxFiles(files: FileOrFolder[]): FileOrFolder[] {
  return files.filter(isOzxFile);
}

/**
 * Extract the path from a file for ZIP/OZX API calls.
 * Removes leading slashes and normalizes the path.
 *
 * @param file - The file to get the path from
 * @returns Normalized path suitable for API calls
 */
export function getZipFilePath(file: FileOrFolder): string {
  let path = file.path;
  // Remove leading slash if present
  if (path.startsWith('/')) {
    path = path.slice(1);
  }
  return path;
}
