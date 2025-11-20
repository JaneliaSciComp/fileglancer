import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';
import { default as log } from '@/logger';
import type { OutletContextType } from '@/layouts/BrowseLayout';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import FileBrowser from './ui/BrowsePage/FileBrowser';
import Toolbar from './ui/BrowsePage/Toolbar';
import RenameDialog from './ui/Dialogs/Rename';
import Delete from './ui/Dialogs/Delete';
import ChangePermissions from './ui/Dialogs/ChangePermissions';
import ConvertFileDialog from './ui/Dialogs/ConvertFile';
import RecentDataLinksCard from './ui/BrowsePage/Dashboard/RecentDataLinksCard';
import RecentlyViewedCard from './ui/BrowsePage/Dashboard/RecentlyViewedCard';
import NavigationInput from './ui/BrowsePage/NavigateInput';
import FgDialog from './ui/Dialogs/FgDialog';

export default function Browse() {
  const {
    setShowPermissionsDialog,
    togglePropertiesDrawer,
    toggleSidebar,
    setShowConvertFileDialog,
    showPermissionsDialog,
    showPropertiesDrawer,
    showSidebar,
    showConvertFileDialog
  } = useOutletContext<OutletContextType>();

  const { fspName } = useFileBrowserContext();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showNavigationDialog, setShowNavigationDialog] = useState(false);
  const [pastedPath, setPastedPath] = useState<string>('');
  const [componentWidth, setComponentWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus the container when component mounts so it can receive paste events
  useEffect(() => {
    const container = document.querySelector(
      '[data-browse-container]'
    ) as HTMLElement;
    if (container) {
      container.focus();
    }
  }, []);

  // Monitor component width changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        setComponentWidth(entry.contentRect.width);
      }
    });
    resizeObserver.observe(container);
    // Set initial width
    setComponentWidth(container.offsetWidth);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      className={`flex flex-col h-full max-h-full max-w-full ${fspName ? 'min-w-fit' : 'w-full'}`}
      data-browse-container
      onPaste={async event => {
        // Check if any input, textarea, or contenteditable element is focused
        const activeElement = document.activeElement;

        const isTextInputFocused =
          activeElement &&
          (activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.getAttribute('contenteditable') === 'true');

        // Only handle paste if no text input is focused
        if (!isTextInputFocused) {
          log.debug('Handling paste event');
          event.preventDefault();

          try {
            const clipboardText = await navigator.clipboard.readText();
            setPastedPath(clipboardText);
            setShowNavigationDialog(true);
          } catch (error) {
            log.debug('Clipboard API failed, using fallback:', error);
            // Fallback to event.clipboardData if clipboard API fails
            const clipboardText = event.clipboardData?.getData('text') || '';
            setPastedPath(clipboardText);
            setShowNavigationDialog(true);
          }
        } else {
          log.debug('Text input is focused, ignoring paste');
        }
      }}
      ref={containerRef}
      tabIndex={0}
    >
      <Toolbar
        showPropertiesDrawer={showPropertiesDrawer}
        showSidebar={showSidebar}
        togglePropertiesDrawer={togglePropertiesDrawer}
        toggleSidebar={toggleSidebar}
      />
      <div
        className={`relative grow shrink-0 max-h-[calc(100%-55px)] flex flex-col overflow-y-auto px-2 ${!fspName ? 'bg-surface-light py-6' : 'min-w-fit'}`}
      >
        {!fspName ? (
          <div className="flex flex-col max-w-full gap-6 px-6">
            <NavigationInput location="dashboard" />
            <div
              className={`flex gap-6 ${componentWidth > 800 ? '' : 'flex-col'}`}
            >
              <RecentlyViewedCard />
              <RecentDataLinksCard />
            </div>
          </div>
        ) : (
          <FileBrowser
            mainPanelWidth={componentWidth}
            setShowConvertFileDialog={setShowConvertFileDialog}
            setShowDeleteDialog={setShowDeleteDialog}
            setShowPermissionsDialog={setShowPermissionsDialog}
            setShowRenameDialog={setShowRenameDialog}
            showPropertiesDrawer={showPropertiesDrawer}
            togglePropertiesDrawer={togglePropertiesDrawer}
          />
        )}
      </div>
      {showRenameDialog ? (
        <RenameDialog
          setShowRenameDialog={setShowRenameDialog}
          showRenameDialog={showRenameDialog}
        />
      ) : null}
      {showDeleteDialog ? (
        <Delete
          setShowDeleteDialog={setShowDeleteDialog}
          showDeleteDialog={showDeleteDialog}
        />
      ) : null}
      {showPermissionsDialog ? (
        <ChangePermissions
          setShowPermissionsDialog={setShowPermissionsDialog}
          showPermissionsDialog={showPermissionsDialog}
        />
      ) : null}
      {showConvertFileDialog ? (
        <ConvertFileDialog
          setShowConvertFileDialog={setShowConvertFileDialog}
          showConvertFileDialog={showConvertFileDialog}
        />
      ) : null}
      {showNavigationDialog ? (
        <FgDialog
          onClose={() => {
            setShowNavigationDialog(false);
            setPastedPath('');
          }}
          open={showNavigationDialog}
        >
          <NavigationInput
            initialValue={pastedPath}
            location="dialog"
            onDialogClose={() => setPastedPath('')}
            setShowNavigationDialog={setShowNavigationDialog}
          />
        </FgDialog>
      ) : null}
    </div>
  );
}
