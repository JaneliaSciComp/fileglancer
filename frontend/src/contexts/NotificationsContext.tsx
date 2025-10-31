import React from 'react';
import { useNotificationsQuery } from '@/queries/notificationQueries';
import type { Notification } from '@/queries/notificationQueries';
import logger from '@/logger';

type NotificationContextType = {
  notifications: Notification[];
  dismissedNotifications: number[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  dismissNotification: (id: number) => void;
};

const NotificationContext = React.createContext<NotificationContextType | null>(
  null
);

export const useNotificationContext = () => {
  const context = React.useContext(NotificationContext);
  if (!context) {
    throw new Error(
      'useNotificationContext must be used within a NotificationProvider'
    );
  }
  return context;
};

export const NotificationProvider = ({
  children
}: {
  readonly children: React.ReactNode;
}) => {
  const [dismissedNotifications, setDismissedNotifications] = React.useState<
    number[]
  >([]);

  // Use TanStack Query for data fetching
  const { data, isLoading, isFetching, error } = useNotificationsQuery();

  // Load dismissed notifications from localStorage
  React.useEffect(() => {
    const dismissed = localStorage.getItem('dismissedNotifications');
    if (dismissed) {
      try {
        setDismissedNotifications(JSON.parse(dismissed));
      } catch {
        logger.warn(
          'Failed to parse dismissed notifications from localStorage'
        );
        localStorage.removeItem('dismissedNotifications');
      }
    }
  }, []);

  const dismissNotification = React.useCallback(
    (id: number) => {
      const newDismissed = [...dismissedNotifications, id];
      setDismissedNotifications(newDismissed);
      localStorage.setItem(
        'dismissedNotifications',
        JSON.stringify(newDismissed)
      );
    },
    [dismissedNotifications]
  );

  return (
    <NotificationContext.Provider
      value={{
        notifications: data || [],
        dismissedNotifications,
        isLoading,
        isFetching,
        error,
        dismissNotification
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
