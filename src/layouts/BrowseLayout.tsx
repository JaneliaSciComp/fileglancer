import React from 'react';
import { Outlet } from 'react-router';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { PiDotsSixVerticalBold } from 'react-icons/pi';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import useLayoutPrefs from '@/hooks/useLayoutPrefs';
import Sidebar from '@/components/ui/Sidebar/Sidebar';
import PropertiesDrawer from '@/components/ui/PropertiesDrawer/PropertiesDrawer';

export type OutletContextType = {
  setShowPermissionsDialog: React.Dispatch<React.SetStateAction<boolean>>;
  togglePropertiesDrawer: () => void;
  toggleSidebar: () => void;
  setShowConvertFileDialog: React.Dispatch<React.SetStateAction<boolean>>;
  showPermissionsDialog: boolean;
  showPropertiesDrawer: boolean;
  showSidebar: boolean;
  showConvertFileDialog: boolean;
};

export const BrowsePageLayout = () => {
  const [showPermissionsDialog, setShowPermissionsDialog] =
    React.useState(false);
  const [showConvertFileDialog, setShowConvertFileDialog] =
    React.useState(false);

  const { isLayoutLoadedFromDB } = usePreferencesContext();
  const {
    layoutPrefsStorage,
    togglePropertiesDrawer,
    showPropertiesDrawer,
    showSidebar,
    toggleSidebar
  } = useLayoutPrefs();

  const outletContextValue: OutletContextType = {
    setShowPermissionsDialog: setShowPermissionsDialog,
    togglePropertiesDrawer: togglePropertiesDrawer,
    toggleSidebar: toggleSidebar,
    setShowConvertFileDialog: setShowConvertFileDialog,
    showPermissionsDialog: showPermissionsDialog,
    showPropertiesDrawer: showPropertiesDrawer,
    showSidebar: showSidebar,
    showConvertFileDialog: showConvertFileDialog
  };

  return (
    <div
      className={`flex h-full w-full overflow-y-hidden ${!isLayoutLoadedFromDB ? 'animate-pulse gap-4 p-4' : ''}`}
    >
      {!isLayoutLoadedFromDB ? (
        <>
          <div className="bg-surface rounded h-full w-1/4"></div>
          <div className="bg-surface rounded h-full w-1/2"></div>
          <div className="bg-surface rounded h-full w-1/4"></div>
        </>
      ) : (
        <PanelGroup
          key={`layout-${isLayoutLoadedFromDB}`}
          autoSaveId="layout"
          direction="horizontal"
          storage={layoutPrefsStorage}
        >
          {showSidebar ? (
            <>
              <Panel id="sidebar" order={1} minSize={10} defaultSize={24}>
                <Sidebar />
              </Panel>
              <PanelResizeHandle className="group relative w-3 bg-surface border-r border-surface hover:border-secondary/60">
                <PiDotsSixVerticalBold className="icon-default stroke-2 absolute -right-1 top-1/2 stroke-black dark:stroke-white pointer-events-none" />
              </PanelResizeHandle>
            </>
          ) : null}
          <Panel id="main" order={2} style={{ overflowX: 'auto' }}>
            <Outlet context={outletContextValue} />
          </Panel>
          {showPropertiesDrawer ? (
            <>
              <PanelResizeHandle className="group relative w-3 bg-surface border-l border-surface hover:border-secondary/60">
                <PiDotsSixVerticalBold className="icon-default stroke-2 absolute -left-1 top-1/2 stroke-black dark:stroke-white pointer-events-none" />
              </PanelResizeHandle>
              <Panel
                id="properties"
                order={3}
                minSize={15}
                defaultSize={24}
                style={{ overflowX: 'auto' }}
                className="bg-background"
              >
                <PropertiesDrawer
                  togglePropertiesDrawer={togglePropertiesDrawer}
                  setShowPermissionsDialog={setShowPermissionsDialog}
                  setShowConvertFileDialog={setShowConvertFileDialog}
                />
              </Panel>
            </>
          ) : null}
        </PanelGroup>
      )}
    </div>
  );
};
