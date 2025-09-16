import { useNotificationContext } from '@/contexts/NotificationsContext';
import {
  getNotificationStyles,
  NotificationItem
} from '@/components/ui/Notifications/NotificationItem';

export default function Notifications() {
  const { notifications, dismissedNotifications, dismissNotification } =
    useNotificationContext();

  const visibleNotifications = notifications.filter(
    notification => !dismissedNotifications.includes(notification.id)
  );

  if (visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div className="w-full mt-2">
      {visibleNotifications.map(notification => {
        const styles = getNotificationStyles(notification.type);
        return (
          <div
            className={`${styles.container} rounded-lg p-4 mb-2 mx-4 relative shadow-sm`}
            key={notification.id}
          >
            <NotificationItem
              notification={notification}
              onDismiss={dismissNotification}
              showDismissButton={true}
            />
          </div>
        );
      })}
    </div>
  );
}
