import type { FileSharePath } from '@/shared.types';

export function isReadOnlyFsp(fsp: FileSharePath | null | undefined): boolean {
  return Boolean(fsp && fsp.protocol !== 'file');
}
