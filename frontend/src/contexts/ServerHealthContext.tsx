import React from 'react';
import {
  checkServerHealth,
  ServerStatus,
  shouldTriggerHealthCheck
} from '@/utils/serverHealth';
import {
  setHealthCheckReporter,
  clearHealthCheckReporter,
  createRetryWithBackoff,
  type RetryState
} from '@/utils';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import logger from '@/logger';

type ServerHealthContextType = {
  status: ServerStatus;
  checkHealth: () => Promise<void>;
  reportFailedRequest: (
    apiPath: string,
    responseStatus?: number
  ) => Promise<void>;
  dismissWarning: () => void;
  showWarningOverlay: boolean;
  nextRetrySeconds: number | null;
};

const ServerHealthContext = React.createContext<ServerHealthContextType | null>(
  null
);

// Health check retry configuration constants
const MAX_RETRY_ATTEMPTS = 100; // Limit total retry attempts to prevent infinite loops
const RETRY_BASE_DELAY_MS = 6000; // Start with 6 seconds
const RETRY_MAX_DELAY_MS = 300000; // Cap at 5 minutes
const HEALTH_CHECK_DEBOUNCE_MS = 1000; // Wait 1 second before checking

export const useServerHealthContext = () => {
  const context = React.useContext(ServerHealthContext);
  if (!context) {
    throw new Error(
      'useServerHealthContext must be used within a ServerHealthProvider'
    );
  }
  return context;
};

export const ServerHealthProvider = ({
  children
}: {
  readonly children: React.ReactNode;
}) => {
  const [status, setStatus] = React.useState<ServerStatus>('healthy');
  const [showWarningOverlay, setShowWarningOverlay] = React.useState(false);
  const [isChecking, setIsChecking] = React.useState(false);
  const [nextRetrySeconds, setNextRetrySeconds] = React.useState<number | null>(
    null
  );
  const isPageVisible = usePageVisibility();

  // Debounce health checks to avoid spam
  const healthCheckTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Abort controller to prevent race conditions
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Retry mechanism state
  const retryStateRef = React.useRef<RetryState | null>(null);

  // Stop retry mechanism
  const stopRetrying = React.useCallback(() => {
    if (retryStateRef.current) {
      retryStateRef.current.stop();
      retryStateRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setNextRetrySeconds(null);
  }, []);

  // Start exponential backoff retry
  const startRetrying = React.useCallback(() => {
    if (retryStateRef.current?.isRetrying) {
      return; // Already retrying
    }

    // Stop any existing retry mechanism
    stopRetrying();

    const retryHealthCheck = async (): Promise<boolean> => {
      try {
        // Cancel any existing health check and create new abort controller
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setIsChecking(true);
        setStatus('checking');

        const healthStatus = await checkServerHealth();

        // Check if this request was aborted
        if (abortControllerRef.current?.signal.aborted) {
          return false;
        }

        setStatus(healthStatus);

        if (healthStatus === 'healthy') {
          setShowWarningOverlay(false);
          logger.debug('Server detected as healthy during retry');
          // reload the page to ensure full recovery
          // window.location.reload();
          return true; // Success - stop retrying
        } else if (healthStatus === 'down') {
          return false; // Continue retrying
        }

        return false;
      } catch (error) {
        logger.error('Error during retry health check:', error);
        setStatus('down');
        return false; // Continue retrying
      } finally {
        setIsChecking(false);
      }
    };

    retryStateRef.current = createRetryWithBackoff(
      retryHealthCheck,
      {
        maxRetryAttempts: MAX_RETRY_ATTEMPTS,
        baseDelayMs: RETRY_BASE_DELAY_MS,
        maxDelayMs: RETRY_MAX_DELAY_MS
      },
      {
        onRetryAttempt: (attemptNumber, totalAttempts) => {
          logger.warn(
            `Server still down during retry (attempt ${attemptNumber}/${totalAttempts})`
          );
        },
        onCountdownUpdate: secondsRemaining => {
          setNextRetrySeconds(secondsRemaining);
        },
        onRetryStop: () => {
          setNextRetrySeconds(null);
        },
        onMaxAttemptsReached: () => {
          logger.warn(`Maximum retry attempts reached, stopping`);
        }
      }
    );
  }, [stopRetrying]);

  const checkHealth = React.useCallback(async () => {
    if (isChecking) {
      return; // Already checking, avoid duplicate checks
    }

    // Cancel any existing health check
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsChecking(true);
    setStatus('checking');

    try {
      const healthStatus = await checkServerHealth();

      // Check if this request was aborted
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      setStatus(healthStatus);

      if (healthStatus === 'down') {
        setShowWarningOverlay(true);
        logger.warn('Server detected as down');
        // Start exponential backoff retries
        startRetrying();
      } else if (healthStatus === 'healthy') {
        setShowWarningOverlay(false);
        logger.debug('Server detected as healthy');
        // Stop retrying since server is healthy
        stopRetrying();
      }
    } catch (error) {
      logger.error('Error during health check:', error);
      setStatus('down');
      setShowWarningOverlay(true);
      // Start exponential backoff retries
      startRetrying();
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, startRetrying, stopRetrying]);

  const reportFailedRequest = React.useCallback(
    async (apiPath: string, responseStatus?: number) => {
      // Only trigger health check if this looks like a server issue
      if (!shouldTriggerHealthCheck(apiPath, responseStatus)) {
        return;
      }

      // Don't check if already checking or already known to be down
      if (isChecking || status === 'down') {
        return;
      }

      // Don't trigger if already retrying (additional safety)
      if (retryStateRef.current?.isRetrying) {
        return;
      }

      logger.debug(
        `Failed request to ${apiPath} (${responseStatus}), triggering health check`
      );

      // Debounce health checks - clear any pending check and schedule a new one
      if (healthCheckTimeoutRef.current) {
        clearTimeout(healthCheckTimeoutRef.current);
      }

      healthCheckTimeoutRef.current = setTimeout(() => {
        checkHealth();
      }, HEALTH_CHECK_DEBOUNCE_MS);
    },
    [checkHealth, isChecking, status]
  );

  const dismissWarning = React.useCallback(() => {
    setShowWarningOverlay(false);
    // reload the page to ensure full recovery
    window.location.reload();
  }, []);

  // Register health check reporter with global sendFetchRequest
  React.useEffect(() => {
    setHealthCheckReporter(reportFailedRequest);
    return () => {
      clearHealthCheckReporter();
    };
  }, [reportFailedRequest]);

  // Pause/resume retry mechanism based on page visibility
  React.useEffect(() => {
    if (!retryStateRef.current) {
      return;
    }

    if (isPageVisible) {
      // Resume retries when page becomes visible
      if (retryStateRef.current.isPaused) {
        logger.debug('Page visible - resuming server health retries');
        retryStateRef.current.resume();
      }
    } else {
      // Pause retries when page becomes hidden
      if (retryStateRef.current.isRetrying && !retryStateRef.current.isPaused) {
        logger.debug('Page hidden - pausing server health retries');
        retryStateRef.current.pause();
      }
    }
  }, [isPageVisible]);

  // Cleanup timeouts and abort controllers on unmount
  React.useEffect(() => {
    return () => {
      if (healthCheckTimeoutRef.current) {
        clearTimeout(healthCheckTimeoutRef.current);
      }
      if (retryStateRef.current) {
        retryStateRef.current.stop();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <ServerHealthContext.Provider
      value={{
        status,
        checkHealth,
        reportFailedRequest,
        dismissWarning,
        showWarningOverlay,
        nextRetrySeconds
      }}
    >
      {children}
    </ServerHealthContext.Provider>
  );
};

export default ServerHealthContext;
