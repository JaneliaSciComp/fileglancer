import React from 'react';
import { Outlet } from 'react-router';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { PiDotsSixVerticalBold } from 'react-icons/pi';
import { ErrorBoundary } from 'react-error-boundary';

import useShowPropertiesDrawer from '@/hooks/useShowPropertiesDrawer';
import usePropertiesTarget from '@/hooks/usePropertiesTarget';

import Sidebar from '@/components/ui/Sidebar/Sidebar';
import PropertiesDrawer from '@/components/ui/PropertiesDrawer/PropertiesDrawer';
import ErrorFallback from '@/components/ErrorFallback';

export const BrowseLayout = () => {
  const [showPermissionsDialog, setShowPermissionsDialog] =
    React.useState(false);
  const [showSidebar, setShowSidebar] = React.useState(true);

  const { showPropertiesDrawer, setShowPropertiesDrawer } =
    useShowPropertiesDrawer();
  const { propertiesTarget, setPropertiesTarget } = usePropertiesTarget();

  const outletContextValue = {
    setShowPermissionsDialog: setShowPermissionsDialog,
    setShowPropertiesDrawer: setShowPropertiesDrawer,
    setPropertiesTarget: setPropertiesTarget,
    setShowSidebar: setShowSidebar,
    showPermissionsDialog: showPermissionsDialog,
    showPropertiesDrawer: showPropertiesDrawer,
    propertiesTarget: propertiesTarget,
    showSidebar: showSidebar
  };

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
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
                  propertiesTarget={propertiesTarget}
                  open={showPropertiesDrawer}
                  setShowPropertiesDrawer={setShowPropertiesDrawer}
                  setShowPermissionsDialog={setShowPermissionsDialog}
                />
              </Panel>
            </>
          ) : null}
        </PanelGroup>
      </div>
    </ErrorBoundary>
  );
};
