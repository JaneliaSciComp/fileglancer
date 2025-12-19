/* eslint-disable react/jsx-max-depth */
// Disable max depth because of many context providers

import { Outlet, useParams } from 'react-router';
import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from 'react-error-boundary';

import { ZonesAndFspMapContextProvider } from '@/contexts/ZonesAndFspMapContext';
import { FileBrowserContextProvider } from '@/contexts/FileBrowserContext';
import { PreferencesProvider } from '@/contexts/PreferencesContext';
import { OpenFavoritesProvider } from '@/contexts/OpenFavoritesContext';
import { TicketProvider } from '@/contexts/TicketsContext';
import { ProxiedPathProvider } from '@/contexts/ProxiedPathContext';
import { ExternalBucketProvider } from '@/contexts/ExternalBucketContext';
import { ProfileContextProvider } from '@/contexts/ProfileContext';
import { NotificationProvider } from '@/contexts/NotificationsContext';
import { ServerHealthProvider } from '@/contexts/ServerHealthContext';
import { NeuroglancerProvider } from '@/contexts/NeuroglancerContext';
import FileglancerNavbar from '@/components/ui/Navbar/Navbar';
import Notifications from '@/components/ui/Notifications/Notifications';
import ErrorFallback from '@/components/ErrorFallback';
import { ServerDownOverlay } from '@/components/ui/Dialogs/ServerDownOverlay';
import { useServerHealthContext } from '@/contexts/ServerHealthContext';

const MainLayoutContent = () => {
  const { showWarningOverlay, checkHealth, nextRetrySeconds } =
    useServerHealthContext();

  return (
    <>
      <Toaster
        position="bottom-center"
        toastOptions={{
          className: 'min-w-fit',
          success: { duration: 4000 }
        }}
      />
      <div className="flex flex-col h-full w-full overflow-y-hidden bg-background text-foreground box-border">
        <div className="flex-shrink-0 w-full">
          <FileglancerNavbar />
          <Notifications />
        </div>
        <div className="flex flex-col items-center flex-1 w-full overflow-hidden">
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </div>
      <ServerDownOverlay
        countdownSeconds={nextRetrySeconds}
        onRetry={checkHealth}
        open={showWarningOverlay}
      />
    </>
  );
};

export const MainLayout = () => {
  const params = useParams();
  const fspName = params.fspName;
  const filePath = params['*']; // Catch-all for file path

  return (
    <ServerHealthProvider>
      <ZonesAndFspMapContextProvider>
        <OpenFavoritesProvider>
          <FileBrowserContextProvider filePath={filePath} fspName={fspName}>
            <PreferencesProvider>
              <ExternalBucketProvider>
                <ProxiedPathProvider>
                  <NeuroglancerProvider>
                    <ProfileContextProvider>
                      <NotificationProvider>
                        <TicketProvider>
                          <MainLayoutContent />
                        </TicketProvider>
                      </NotificationProvider>
                    </ProfileContextProvider>
                  </NeuroglancerProvider>
                </ProxiedPathProvider>
              </ExternalBucketProvider>
            </PreferencesProvider>
          </FileBrowserContextProvider>
        </OpenFavoritesProvider>
      </ZonesAndFspMapContextProvider>
    </ServerHealthProvider>
  );
};
