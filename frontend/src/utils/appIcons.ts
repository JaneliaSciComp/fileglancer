import type { IconType } from 'react-icons';
import { FaServer } from 'react-icons/fa6';
import { IoTerminal } from 'react-icons/io5';

import type { AppEntryPoint, AppManifest } from '@/shared.types';

/** Icon representing an entry point: a server for services, a terminal for batch jobs. */
export function getEntryPointIconType(entryPoint?: AppEntryPoint): IconType {
  return entryPoint?.type === 'service' ? FaServer : IoTerminal;
}

/**
 * Icon representing an app, derived from its primary (first) entry point.
 * Falls back to the job (terminal) icon when the manifest isn't loaded.
 */
export function getAppIconType(manifest?: AppManifest): IconType {
  return getEntryPointIconType(manifest?.runnables?.[0]);
}
