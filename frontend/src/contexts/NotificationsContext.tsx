import React from 'react';
import { sendFetchRequest } from '@/utils';
import type { Result } from '@/shared.types';
import { createSuccess, handleError, toHttpError } from '@/utils/errorHandling';
import logger from '@/logger';

export type Notification = {
  id: number;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  active: boolean;
  created_at: string;
  expires_at?: string;
};

type NotificationContextType = {
  notifications: Notification[];
  dismissedNotifications: number[];
  error: string | null;
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
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [dismissedNotifications, setDismissedNotifications] = React.useState<
    number[]
  >([]);
  const [error, setError] = React.useState<string | null>(null);

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

  const fetchNotifications = React.useCallback(async (): Promise<
    Result<Notification[] | null>
  > => {
    setError(null);

    try {
      const response = await sendFetchRequest('/api/notifications', 'GET');

      if (response.ok) {
        const data = await response.json();
        if (data?.notifications) {
          return createSuccess(data.notifications as Notification[]);
        }
        // Not an error, just no notifications available
        return createSuccess(null);
      } else {
        throw await toHttpError(response);
      }
    } catch (error) {
      return handleError(error);
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

  // Fetch notifications on mount and then every minute
  React.useEffect(() => {
    const fetchAndSetNotifications = async () => {
      const result = await fetchNotifications();
      if (result.success) {
        setNotifications(result.data || []);
      } else {
        setError(`Error fetching notifications: ${result.error}`);
      }
    };

    // Initial fetch
    fetchAndSetNotifications();

    // Set up interval to fetch every minute (60000ms)
    const interval = setInterval(fetchAndSetNotifications, 60000);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        dismissedNotifications,
        error,
        dismissNotification
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
