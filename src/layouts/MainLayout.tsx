/* eslint-disable react/jsx-max-depth */
import { Outlet, useParams } from 'react-router';
import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from 'react-error-boundary';

import { CookiesProvider } from '@/contexts/CookiesContext';
import { ZonesAndFspMapContextProvider } from '@/contexts/ZonesAndFspMapContext';
import { FileBrowserContextProvider } from '@/contexts/FileBrowserContext';
import { PreferencesProvider } from '@/contexts/PreferencesContext';
import { OpenFavoritesProvider } from '@/contexts/OpenFavoritesContext';
import { TicketProvider } from '@/contexts/TicketsContext';
import { ProxiedPathProvider } from '@/contexts/ProxiedPathContext';
import { ExternalBucketProvider } from '@/contexts/ExternalBucketContext';
import { ProfileContextProvider } from '@/contexts/ProfileContext';
import { NotificationProvider } from '@/contexts/NotificationsContext';
import FileglancerNavbar from '@/components/ui/Navbar/Navbar';
import { BetaBanner } from '@/components/ui/Beta';
import Notifications from '@/components/ui/Notifications/Notifications';
import ErrorFallback from '@/components/ErrorFallback';

export const MainLayout = () => {
  const params = useParams();
  const fspName = params.fspName;
  const filePath = params['*']; // Catch-all for file path

  return (
    <CookiesProvider>
      <ZonesAndFspMapContextProvider>
        <OpenFavoritesProvider>
          <FileBrowserContextProvider filePath={filePath} fspName={fspName}>
            <PreferencesProvider>
              <ProxiedPathProvider>
                <ExternalBucketProvider>
                  <ProfileContextProvider>
                    <NotificationProvider>
                      <TicketProvider>
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
                            <BetaBanner />
                          </div>
                          <div className="flex flex-col items-center flex-1 w-full overflow-hidden">
                            <ErrorBoundary FallbackComponent={ErrorFallback}>
                              <Outlet />
                            </ErrorBoundary>
                          </div>
                        </div>
                      </TicketProvider>
                    </NotificationProvider>
                  </ProfileContextProvider>
                </ExternalBucketProvider>
              </ProxiedPathProvider>
            </PreferencesProvider>
          </FileBrowserContextProvider>
        </OpenFavoritesProvider>
      </ZonesAndFspMapContextProvider>
    </CookiesProvider>
  );
};
