import React from 'react';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useServerHealthContext } from '@/contexts/ServerHealthContext';
import logger from '@/logger';
import {
  LAYOUT_NAME,
  WITH_PROPERTIES_AND_SIDEBAR,
  ONLY_SIDEBAR,
  ONLY_PROPERTIES,
  DEFAULT_LAYOUT,
  DEFAULT_LAYOUT_SMALL_SCREENS
} from '@/constants/layoutConstants';
/**
 * Custom hook that provides storage interface for react-resizable-panels
 * with debounced updates to reduce API calls when resizing panels
 * See example implementation here: https://react-resizable-panels.vercel.app/examples/external-persistence
 * Note that the custom storage interface must expose a synchronous getItem and setItem method.
 */

const DEBOUNCE_MS = 500;

export default function useLayoutPrefs() {
  const [showPropertiesDrawer, setShowPropertiesDrawer] =
    React.useState<boolean>(false);
  const [showSidebar, setShowSidebar] = React.useState(true);
  const { layout, handleUpdateLayout, preferenceQuery } =
    usePreferencesContext();
  const { status: serverStatus } = useServerHealthContext();

  const timerRef = React.useRef<number | null>(null);
  const lastSavedLayoutRef = React.useRef<string | null>(null);
  const hasInitializedRef = React.useRef(false);

  const debouncedUpdateLayout = React.useCallback(
    (newLayout: string) => {
      // Skip if this exact layout was just saved
      if (lastSavedLayoutRef.current === newLayout) {
        return;
      }

      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }

      timerRef.current = window.setTimeout(() => {
        lastSavedLayoutRef.current = newLayout;
        handleUpdateLayout(newLayout).catch(error => {
          logger.debug('Failed to update layout:', error);
        });
        timerRef.current = null;
      }, DEBOUNCE_MS);
    },
    [handleUpdateLayout]
  );

  const togglePropertiesDrawer = () => {
    setShowPropertiesDrawer(prev => !prev);
  };

  const toggleSidebar = () => {
    setShowSidebar(prev => !prev);
  };

  // Initialize layouts from saved preferences (only once on mount)
  React.useEffect(() => {
    if (preferenceQuery.isPending || hasInitializedRef.current) {
      return;
    }

    hasInitializedRef.current = true;

    if (layout === '') {
      // If screen is small, default to no sidebar or properties drawer
      if (window.innerWidth < 640) {
        setShowPropertiesDrawer(false);
        setShowSidebar(false);
        return;
      } else {
        // default layout for larger screens includes properties drawer
        setShowPropertiesDrawer(true);
      }
    } else {
      try {
        const parsedLayout = JSON.parse(layout);
        const panelGroupData = parsedLayout[LAYOUT_NAME];

        if (panelGroupData) {
          if (panelGroupData[WITH_PROPERTIES_AND_SIDEBAR]) {
            setShowPropertiesDrawer(true);
            setShowSidebar(true);
          } else if (panelGroupData[ONLY_SIDEBAR]) {
            setShowPropertiesDrawer(false);
            setShowSidebar(true);
          } else if (panelGroupData[ONLY_PROPERTIES]) {
            setShowPropertiesDrawer(true);
            setShowSidebar(false);
          } else if (panelGroupData.main) {
            setShowSidebar(false);
            setShowPropertiesDrawer(false);
          }
        }
      } catch (error) {
        logger.debug('Error parsing layout:', error);
      }
    }
  }, [layout, preferenceQuery.isPending]);

  const layoutPrefsStorage = React.useMemo(
    () => ({
      getItem(name: string): string {
        // Don't try to parse layout until it's loaded from the database
        if (preferenceQuery.isPending) {
          return '';
        }
        // If layout is empty, return default layout based on screen size
        if (layout === '') {
          if (window.innerWidth < 640) {
            return DEFAULT_LAYOUT_SMALL_SCREENS;
          } else {
            return DEFAULT_LAYOUT;
          }
        }

        try {
          const layoutObj = JSON.parse(layout);
          const storedLayout = JSON.stringify(layoutObj[name]);

          if (!storedLayout) {
            return '';
          } else {
            return storedLayout;
          }
        } catch (error) {
          logger.debug('Error getting layout item:', error);
          return '';
        }
      },
      setItem(name: string, value: string) {
        if (preferenceQuery.isPending) {
          return;
        }
        // This check is here, because if the server is down, we don't want to
        // attempt to send additional requests to update the layout preference to a server
        // that may be experiencing issues. The layout requests occur every time the site
        // tries to check if the server is back up, which can lead to a lot of
        // unnecessary requests if the server is down for an extended period of time.
        if (serverStatus === 'down') {
          logger.debug('Server is down, skipping layout update');
          return;
        }

        if (value === null || value === undefined || value === '') {
          return;
        }

        try {
          const incomingLayout = JSON.parse(value);
          const incomingLayoutKeys = Object.keys(incomingLayout);
          let newLayoutObj = {};

          // Find key to use
          // If there is only one key, this is the first time the layout is being set and we can use the one key directly
          //If there are multiple keys, use the one that does not exist in the current layout
          let key = '';
          if (incomingLayoutKeys.length === 1) {
            key = incomingLayoutKeys[0];
          } else if (incomingLayoutKeys.length > 1) {
            const possibleKey = incomingLayoutKeys.find(
              key => !Object.keys(JSON.parse(layout)[LAYOUT_NAME]).includes(key)
            );
            key = possibleKey || '';
          }

          // The new layout should use the key that matches the current state of the properties panel
          if (
            key === WITH_PROPERTIES_AND_SIDEBAR &&
            showPropertiesDrawer &&
            showSidebar
          ) {
            newLayoutObj = {
              [name]: {
                [WITH_PROPERTIES_AND_SIDEBAR]:
                  incomingLayout[WITH_PROPERTIES_AND_SIDEBAR]
              }
            };
          } else if (
            key === ONLY_SIDEBAR &&
            !showPropertiesDrawer &&
            showSidebar
          ) {
            newLayoutObj = {
              [name]: {
                [ONLY_SIDEBAR]: incomingLayout[ONLY_SIDEBAR]
              }
            };
          } else if (
            key === ONLY_PROPERTIES &&
            showPropertiesDrawer &&
            !showSidebar
          ) {
            newLayoutObj = {
              [name]: {
                [ONLY_PROPERTIES]: incomingLayout[ONLY_PROPERTIES]
              }
            };
          } else if (key === 'main' && !showPropertiesDrawer && !showSidebar) {
            newLayoutObj = {
              [name]: {
                main: incomingLayout['main']
              }
            };
          } else {
            logger.debug('Invalid layout value:', value);
            return;
          }

          // Pass to debounce func, eventually preferences API
          // Note: setItem has to be synchronous for react-resizable-panels,
          // which is there's no await here even though handleUpdateLayout is async
          const newLayoutString = JSON.stringify(newLayoutObj);
          debouncedUpdateLayout(newLayoutString);
        } catch (error) {
          logger.debug('Error setting layout item:', error);
        }
      }
    }),
    [
      layout,
      debouncedUpdateLayout,
      preferenceQuery.isPending,
      showPropertiesDrawer,
      showSidebar,
      serverStatus
    ]
  );

  // Clean up the timer on unmount
  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    layoutPrefsStorage,
    showPropertiesDrawer,
    togglePropertiesDrawer,
    showSidebar,
    toggleSidebar
  };
}
