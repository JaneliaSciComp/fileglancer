import { describe, test, expect } from 'vitest';
import { getBrowserRenderableType } from '@/utils/fileTypes';

describe('getBrowserRenderableType', () => {
  test('returns "image" for image extensions', () => {
    expect(getBrowserRenderableType('photo.png')).toBe('image');
    expect(getBrowserRenderableType('photo.jpg')).toBe('image');
    expect(getBrowserRenderableType('photo.jpeg')).toBe('image');
    expect(getBrowserRenderableType('photo.gif')).toBe('image');
    expect(getBrowserRenderableType('photo.webp')).toBe('image');
    expect(getBrowserRenderableType('icon.svg')).toBe('image');
    expect(getBrowserRenderableType('icon.ico')).toBe('image');
    expect(getBrowserRenderableType('photo.bmp')).toBe('image');
  });

  test('returns "video" for video extensions', () => {
    expect(getBrowserRenderableType('clip.mp4')).toBe('video');
    expect(getBrowserRenderableType('clip.webm')).toBe('video');
    expect(getBrowserRenderableType('clip.ogv')).toBe('video');
  });

  test('returns "audio" for audio extensions', () => {
    expect(getBrowserRenderableType('track.mp3')).toBe('audio');
    expect(getBrowserRenderableType('track.wav')).toBe('audio');
    expect(getBrowserRenderableType('track.ogg')).toBe('audio');
    expect(getBrowserRenderableType('track.aac')).toBe('audio');
    expect(getBrowserRenderableType('track.flac')).toBe('audio');
  });

  test('returns "pdf" for PDF files', () => {
    expect(getBrowserRenderableType('doc.pdf')).toBe('pdf');
  });

  test('returns null for non-renderable extensions', () => {
    expect(getBrowserRenderableType('file.txt')).toBeNull();
    expect(getBrowserRenderableType('data.csv')).toBeNull();
    expect(getBrowserRenderableType('archive.zip')).toBeNull();
    expect(getBrowserRenderableType('script.py')).toBeNull();
  });

  test('is case-insensitive', () => {
    expect(getBrowserRenderableType('FILE.PNG')).toBe('image');
    expect(getBrowserRenderableType('video.MP4')).toBe('video');
    expect(getBrowserRenderableType('Doc.PDF')).toBe('pdf');
  });

  test('returns null for files without extensions', () => {
    expect(getBrowserRenderableType('Makefile')).toBeNull();
    expect(getBrowserRenderableType('README')).toBeNull();
  });

  test('returns null for files ending with a dot', () => {
    expect(getBrowserRenderableType('file.')).toBeNull();
  });

  test('uses the last extension for multi-dot filenames', () => {
    expect(getBrowserRenderableType('archive.tar.gz')).toBeNull();
    expect(getBrowserRenderableType('image.backup.png')).toBe('image');
  });
});
