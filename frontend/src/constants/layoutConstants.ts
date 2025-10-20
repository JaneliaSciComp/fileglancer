// Shared constants for layout management between PreferencesContext and useLayoutPrefs

// Name is set by the autosaveId prop in PanelGroup
export const LAYOUT_NAME = 'react-resizable-panels:layout';

// Layout keys for the different panel combinations
// Confusingly, the names are in alphabetical order, but the order of the sizes is set by the order prop
// in the respective Panel components
export const WITH_PROPERTIES_AND_SIDEBAR = 'main,properties,sidebar';
export const ONLY_SIDEBAR = 'main,sidebar';
export const ONLY_PROPERTIES = 'main,properties';

export const DEFAULT_LAYOUT =
  '{"main,properties,sidebar":{"expandToSizes":{},"layout":[24,50,26]}}';
export const DEFAULT_LAYOUT_SMALL_SCREENS =
  '{"main":{"expandToSizes":{},"layout":[100]}}';
