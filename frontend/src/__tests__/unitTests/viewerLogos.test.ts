import { describe, it, expect } from 'vitest';
import { getViewerLogo } from '@/config/viewerLogos';
import fallback_logo from '@/assets/fallback_logo.png';

describe('getViewerLogo', () => {
  describe('Existing logo files', () => {
    it('should return logo path for viewer with existing logo file', () => {
      const neuroglancerLogo = getViewerLogo('neuroglancer');
      expect(neuroglancerLogo).toBeTruthy();
      expect(neuroglancerLogo).not.toBe(fallback_logo);
    });

    it('should return logo path for avivator', () => {
      const avivatorLogo = getViewerLogo('avivator');
      expect(avivatorLogo).toBeTruthy();
      expect(avivatorLogo).not.toBe(fallback_logo);
    });

    it('should return logo path for validator', () => {
      const validatorLogo = getViewerLogo('validator');
      expect(validatorLogo).toBeTruthy();
      expect(validatorLogo).not.toBe(fallback_logo);
    });

    it('should return logo path for vole', () => {
      const voleLogo = getViewerLogo('vol-e');
      expect(voleLogo).toBeTruthy();
      expect(voleLogo).not.toBe(fallback_logo);
    });
  });

  describe('Custom logo paths', () => {
    it('should return logo when custom logo path exists', () => {
      // Using an existing logo file as a custom path
      const customLogo = getViewerLogo('any-name', 'neuroglancer.png');
      expect(customLogo).toBeTruthy();
      expect(customLogo).not.toBe(fallback_logo);
    });

    it('should return fallback when custom logo path does not exist', () => {
      const nonExistentCustomLogo = getViewerLogo('test', 'nonexistent.png');
      expect(nonExistentCustomLogo).toBe(fallback_logo);
    });
  });

  describe('Fallback logo handling', () => {
    it('should return fallback logo when viewer logo file does not exist', () => {
      const nonExistentViewerLogo = getViewerLogo('nonexistent_viewer');
      expect(nonExistentViewerLogo).toBe(fallback_logo);
    });

    it('should return fallback logo for custom_viewer without logo file', () => {
      const customViewerLogo = getViewerLogo('custom_viewer');
      expect(customViewerLogo).toBe(fallback_logo);
    });

    it('should return fallback logo for unknown viewer names', () => {
      const unknownLogo = getViewerLogo('unknown_test_viewer_xyz');
      expect(unknownLogo).toBe(fallback_logo);
    });
  });

  describe('Case handling', () => {
    it('should handle lowercase viewer names', () => {
      const logo = getViewerLogo('neuroglancer');
      expect(logo).toBeTruthy();
      expect(logo).not.toBe(fallback_logo);
    });

    it('should convert uppercase to lowercase for logo lookup', () => {
      // getViewerLogo converts to lowercase, so 'NEUROGLANCER' -> 'neuroglancer.png'
      const logo = getViewerLogo('NEUROGLANCER');
      expect(logo).toBeTruthy();
      expect(logo).not.toBe(fallback_logo);
    });

    it('should handle mixed case viewer names', () => {
      const logo = getViewerLogo('NeuroGlancer');
      expect(logo).toBeTruthy();
      expect(logo).not.toBe(fallback_logo);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string viewer name', () => {
      const emptyLogo = getViewerLogo('');
      expect(emptyLogo).toBe(fallback_logo);
    });

    it('should handle viewer names with special characters', () => {
      const specialLogo = getViewerLogo('viewer-with-dashes');
      expect(specialLogo).toBe(fallback_logo);
    });

    it('should handle viewer names with underscores', () => {
      const underscoreLogo = getViewerLogo('viewer_with_underscores');
      expect(underscoreLogo).toBe(fallback_logo);
    });
  });
});
