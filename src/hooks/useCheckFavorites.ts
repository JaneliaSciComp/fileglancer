import {
  FolderFavorite,
  usePreferencesContext
} from '@/contexts/PreferencesContext';
import type { Zone, FileSharePath } from '@/shared.types';
import { makeMapKey } from '@/utils';

export default function useCheckFavorites() {
  const { fileSharePathPreferenceMap, folderPreferenceMap } =
    usePreferencesContext();

  const isFavorite = (
    item: Zone | FileSharePath | FolderFavorite,
    type: 'zone' | 'fileSharePath' | 'folder'
  ): boolean => {
    if (type === 'fileSharePath') {
      const fsp = item as FileSharePath;
      return !!fileSharePathPreferenceMap[makeMapKey('fsp', fsp.name)];
    } else if (type === 'folder') {
      const folder = item as FolderFavorite;
      return !!folderPreferenceMap[
        makeMapKey('folder', `${folder.fsp.name}_${folder.folderPath}`)
      ];
    } else if (type === 'zone') {
      const zone = item as Zone;
      return !!fileSharePathPreferenceMap[makeMapKey('zone', zone.name)];
    }
    return false;
  };

  return {
    isFavorite
  };
}
