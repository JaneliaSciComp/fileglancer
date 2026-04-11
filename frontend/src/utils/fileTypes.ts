const BROWSER_RENDERABLE_EXTENSIONS: Record<
  string,
  'image' | 'video' | 'audio' | 'pdf'
> = {
  // Images
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  ico: 'image',
  bmp: 'image',
  // Video
  mp4: 'video',
  webm: 'video',
  ogv: 'video',
  // Audio
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  aac: 'audio',
  flac: 'audio',
  // Documents
  pdf: 'pdf'
};

/**
 * Returns the browser-renderable media type for a filename, or null if the
 * browser cannot render it natively. Used to gate the "View" menu item and
 * (in future) to select the appropriate inline preview renderer.
 */
export function getBrowserRenderableType(
  filename: string
): 'image' | 'video' | 'audio' | 'pdf' | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  return BROWSER_RENDERABLE_EXTENSIONS[ext] ?? null;
}
