import { Card, Typography } from '@material-tailwind/react';
import { HiOutlineInformationCircle } from 'react-icons/hi';
import { useNotificationContext } from '@/contexts/NotificationsContext';
import {
  getNotificationStyles,
  NotificationItem
} from '@/components/ui/Notifications/NotificationItem';

export default function Notifications() {
  const { notifications, dismissedNotifications, error, dismissNotification } =
    useNotificationContext();

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <Typography className="text-foreground font-bold" type="h5">
          Notifications ({notifications.length})
        </Typography>
      </div>
      {error ? (
        <Card className="p-6">
          <Typography className="text-error">{error}</Typography>
        </Card>
      ) : notifications.length > 0 ? (
        <div className="mb-8">
          <div className="space-y-3">
            {notifications.map(notification => {
              const styles = getNotificationStyles(notification.type);
              const isClientDismissed = dismissedNotifications.includes(
                notification.id
              );
              const isInactive = !notification.active;
              const isDismissed = isClientDismissed || isInactive;

              return (
                <Card
                  className={`${styles.container} p-4 ${isDismissed ? 'opacity-60' : ''}`}
                  key={notification.id}
                >
                  <NotificationItem
                    isDismissed={isDismissed}
                    notification={notification}
                    onDismiss={dismissNotification}
                    showDismissButton={
                      notification.active ? !isClientDismissed : null
                    }
                  />
                </Card>
              );
            })}
          </div>
        </div>
      ) : notifications.length === 0 ? (
        <Card className="p-8 text-center">
          <HiOutlineInformationCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <Typography className="text-foreground mb-2" type="h6">
            No notifications
          </Typography>
          <Typography className="text-muted-foreground">
            You don't have any notifications at the moment.
          </Typography>
        </Card>
      ) : null}
    </>
  );
}
