import React from 'react';
import { Outlet } from 'react-router';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { PiDotsSixVerticalBold } from 'react-icons/pi';

import useShowPropertiesDrawer from '@/hooks/useShowPropertiesDrawer';
import Sidebar from '@/components/ui/Sidebar/Sidebar';
import PropertiesDrawer from '@/components/ui/PropertiesDrawer/PropertiesDrawer';

export const BrowsePageLayout = () => {
  const [showPermissionsDialog, setShowPermissionsDialog] =
    React.useState(false);
  const [showConvertFileDialog, setShowConvertFileDialog] =
    React.useState(false);
  const [showSidebar, setShowSidebar] = React.useState(true);

  const { showPropertiesDrawer, setShowPropertiesDrawer } =
    useShowPropertiesDrawer();

  const outletContextValue = {
    setShowPermissionsDialog: setShowPermissionsDialog,
    setShowPropertiesDrawer: setShowPropertiesDrawer,
    setShowSidebar: setShowSidebar,
    setShowConvertFileDialog: setShowConvertFileDialog,
    showPermissionsDialog: showPermissionsDialog,
    showPropertiesDrawer: showPropertiesDrawer,
    showSidebar: showSidebar,
    showConvertFileDialog: showConvertFileDialog
  };

  return (
    <div className="flex h-full w-full overflow-y-hidden">
      <PanelGroup autoSaveId="conditional" direction="horizontal">
        {showSidebar ? (
          <>
            <Panel
              id="sidebar"
              order={1}
              defaultSize={18}
              minSize={10}
              maxSize={50}
            >
              <Sidebar />
            </Panel>
            <PanelResizeHandle className="group relative border-r border-surface hover:border-secondary/60">
              <PiDotsSixVerticalBold className="icon-default stroke-2 absolute -right-1 top-1/2 stroke-black dark:stroke-white" />
            </PanelResizeHandle>
          </>
        ) : null}
        <Panel id="main" order={2}>
          <Outlet context={outletContextValue} />
        </Panel>
        {showPropertiesDrawer ? (
          <>
            <PanelResizeHandle className="group relative w-3 bg-surface border-l border-surface hover:border-secondary/60">
              <PiDotsSixVerticalBold className="icon-default stroke-2 absolute -left-1 top-1/2 stroke-black dark:stroke-white" />
            </PanelResizeHandle>
            <Panel
              id="properties"
              order={3}
              defaultSize={18}
              minSize={15}
              maxSize={50}
            >
              <PropertiesDrawer
                setShowPropertiesDrawer={setShowPropertiesDrawer}
                setShowPermissionsDialog={setShowPermissionsDialog}
                setShowConvertFileDialog={setShowConvertFileDialog}
              />
            </Panel>
          </>
        ) : null}
      </PanelGroup>
    </div>
  );
};
