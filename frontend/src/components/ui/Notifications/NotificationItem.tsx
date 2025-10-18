import {
  HiOutlineInformationCircle,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineX
} from 'react-icons/hi';
import { HiOutlineExclamationTriangle } from 'react-icons/hi2';

const formatNotificationDate = (dateString?: string): string => {
  if (!dateString) {
    return '';
  }

  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
      return 'Just now';
    }
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }

    return date.toLocaleDateString();
  } catch {
    return '';
  }
};

export const NotificationIcon = ({ type }: { readonly type: string }) => {
  const iconClass = 'h-5 w-5';

  switch (type) {
    case 'warning':
      return <HiOutlineExclamationTriangle className={iconClass} />;
    case 'success':
      return <HiOutlineCheckCircle className={iconClass} />;
    case 'error':
      return <HiOutlineXCircle className={iconClass} />;
    case 'info':
    default:
      return <HiOutlineInformationCircle className={iconClass} />;
  }
};

export const getNotificationStyles = (type: string) => {
  switch (type) {
    case 'warning':
      return {
        container:
          'bg-warning-light dark:bg-warning-dark border border-warning-dark dark:border-warning',
        icon: 'text-warning',
        text: 'text-warning-dark dark:text-warning-light',
        close:
          'text-warning dark:text-warning-light hover:text-warning-dark dark:hover:text-warning-foreground'
      };
    case 'success':
      return {
        container:
          'bg-success-light dark:bg-success-dark border border-success-dark dark:border-success',
        icon: 'text-success',
        text: 'text-success-dark dark:text-success-light',
        close:
          'text-success dark:text-success-light hover:text-success-dark dark:hover:text-success-foreground'
      };
    case 'error':
      return {
        container:
          'bg-error-light dark:bg-error-dark border border-error-dark dark:border-error',
        icon: 'text-error',
        text: 'text-error-dark dark:text-error-light',
        close:
          'text-error dark:text-error-light hover:text-error-dark dark:hover:text-error-foreground'
      };
    case 'info':
    default:
      return {
        container:
          'bg-info-light dark:bg-info-dark border border-info-dark dark:border-info',
        icon: 'text-info',
        text: 'text-info-dark dark:text-info-light',
        close:
          'text-info dark:text-info-light hover:text-info-dark dark:hover:text-info-foreground'
      };
  }
};

export interface NotificationItemProps {
  readonly notification: {
    id: number;
    type: string;
    title: string;
    message: string;
    created_at?: string;
  };
  readonly onDismiss?: (id: number) => void;
  readonly showDismissButton?: boolean;
  readonly className?: string;
  readonly isDismissed?: boolean;
}

export const NotificationItem = ({
  notification,
  onDismiss,
  showDismissButton = true,
  className = '',
  isDismissed = false
}: NotificationItemProps) => {
  const styles = getNotificationStyles(notification.type);

  return (
    <div className={`flex items-start ${className}`}>
      <div className={`${styles.icon} flex-shrink-0 mr-3`}>
        <NotificationIcon type={notification.type} />
      </div>
      <div className={`${styles.text} flex-1 min-w-0`}>
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">{notification.title}</div>
          {notification.created_at ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">
              {formatNotificationDate(notification.created_at)}
            </div>
          ) : null}
        </div>
        <div className="text-sm opacity-90 mt-1">{notification.message}</div>
      </div>
      {showDismissButton && onDismiss ? (
        <button
          aria-label="Dismiss notification"
          className={`${styles.close} flex-shrink-0 ml-3 p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors`}
          onClick={() => onDismiss(notification.id)}
          type="button"
        >
          <HiOutlineX className="h-4 w-4" />
        </button>
      ) : null}
      {isDismissed ? (
        <div className="flex-shrink-0 ml-3 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
          Dismissed
        </div>
      ) : null}
    </div>
  );
};
