import logger from '@/logger';

export interface RetryOptions {
  maxRetryAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  msPerSecond?: number;
}

export interface RetryCallbacks {
  onRetryAttempt?: (attemptNumber: number, totalAttempts: number) => void;
  onCountdownUpdate?: (secondsRemaining: number) => void;
  onRetryStop?: () => void;
  onMaxAttemptsReached?: () => void;
}

export interface RetryState {
  isRetrying: boolean;
  attemptNumber: number;
  isPaused: boolean;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetryAttempts: 100,
  baseDelayMs: 6000,
  maxDelayMs: 300000,
  msPerSecond: 1000
};

/**
 * Creates a retry mechanism with exponential backoff
 * @param retryFunction Function to retry (should return Promise<boolean> where true means success)
 * @param options Retry configuration options
 * @param callbacks Optional callbacks for retry events
 * @returns RetryState object with control methods and current state
 */
export function createRetryWithBackoff(
  retryFunction: () => Promise<boolean>,
  options: RetryOptions = {},
  callbacks: RetryCallbacks = {}
): RetryState {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };

  let isRetrying = false;
  let isPaused = false;
  let attemptNumber = 0;
  let retryTimeoutId: NodeJS.Timeout | null = null;
  let countdownIntervalId: NodeJS.Timeout | null = null;
  let abortController: AbortController | null = null;
  let remainingDelayMs = 0;
  let pausedAtMs = 0;

  const calculateExponentialBackoffDelay = (attempt: number): number => {
    return Math.min(
      config.baseDelayMs * Math.pow(2, attempt),
      config.maxDelayMs
    );
  };

  const stop = (): void => {
    if (retryTimeoutId) {
      clearTimeout(retryTimeoutId);
      retryTimeoutId = null;
    }
    if (countdownIntervalId) {
      clearInterval(countdownIntervalId);
      countdownIntervalId = null;
    }
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    isRetrying = false;
    isPaused = false;
    attemptNumber = 0;
    remainingDelayMs = 0;
    pausedAtMs = 0;
    callbacks.onRetryStop?.();
  };

  const scheduleNextRetry = (customDelayMs?: number): void => {
    const delay = customDelayMs ?? calculateExponentialBackoffDelay(attemptNumber);
    logger.debug(
      `Scheduling next retry in ${delay}ms (attempt ${attemptNumber + 1})`
    );

    remainingDelayMs = delay;
    const startTimeMs = Date.now();

    // Update countdown immediately
    const updateCountdown = () => {
      const elapsed = Date.now() - startTimeMs;
      const remaining = Math.max(0, delay - elapsed);
      const secondsRemaining = Math.ceil(remaining / config.msPerSecond);
      callbacks.onCountdownUpdate?.(secondsRemaining);
    };

    updateCountdown();

    // Set up countdown interval to update every second
    countdownIntervalId = setInterval(updateCountdown, config.msPerSecond);

    const executeRetry = async () => {
      // Clear countdown interval
      if (countdownIntervalId) {
        clearInterval(countdownIntervalId);
        countdownIntervalId = null;
      }

      attemptNumber++;

      // Stop retrying if we've exceeded the maximum attempts
      if (attemptNumber > config.maxRetryAttempts) {
        logger.warn(
          `Stopping retries after ${config.maxRetryAttempts} attempts`
        );
        callbacks.onMaxAttemptsReached?.();
        stop();
        return;
      }

      // Cancel any existing operation and create new abort controller
      if (abortController) {
        abortController.abort();
      }
      abortController = new AbortController();

      callbacks.onRetryAttempt?.(attemptNumber, config.maxRetryAttempts);

      try {
        const success = await retryFunction();

        // Check if this operation was aborted
        if (abortController?.signal.aborted) {
          return;
        }

        if (success) {
          logger.debug('Retry succeeded, stopping retry mechanism');
          stop();
        } else {
          logger.warn(
            `Retry attempt ${attemptNumber}/${config.maxRetryAttempts} failed`
          );
          // Continue retrying if we haven't exceeded max attempts
          if (attemptNumber < config.maxRetryAttempts) {
            scheduleNextRetry();
          } else {
            logger.warn(`Maximum retry attempts reached, stopping`);
            callbacks.onMaxAttemptsReached?.();
            stop();
          }
        }
      } catch (error) {
        logger.error(`Error during retry attempt ${attemptNumber}:`, error);
        // Continue retrying if we haven't exceeded max attempts
        if (attemptNumber < config.maxRetryAttempts) {
          scheduleNextRetry();
        } else {
          logger.warn(`Maximum retry attempts reached, stopping`);
          callbacks.onMaxAttemptsReached?.();
          stop();
        }
      }
    };

    retryTimeoutId = setTimeout(executeRetry, delay);
  };

  const pause = (): void => {
    if (!isRetrying || isPaused) {
      return; // Not retrying or already paused
    }

    isPaused = true;
    pausedAtMs = Date.now();

    // Clear timers but preserve state
    if (retryTimeoutId) {
      clearTimeout(retryTimeoutId);
      retryTimeoutId = null;
    }
    if (countdownIntervalId) {
      clearInterval(countdownIntervalId);
      countdownIntervalId = null;
    }

    logger.debug('Retry mechanism paused');
  };

  const resume = (): void => {
    if (!isRetrying || !isPaused) {
      return; // Not retrying or not paused
    }

    isPaused = false;
    const pauseDuration = Date.now() - pausedAtMs;
    remainingDelayMs = Math.max(0, remainingDelayMs - pauseDuration);

    logger.debug(`Retry mechanism resumed with ${remainingDelayMs}ms remaining`);

    // Resume with remaining delay
    scheduleNextRetry(remainingDelayMs);
  };

  const start = (): void => {
    if (isRetrying) {
      return; // Already retrying
    }

    isRetrying = true;
    attemptNumber = 0;
    scheduleNextRetry();
  };

  // Auto-start the retry mechanism
  start();

  return {
    get isRetrying() {
      return isRetrying;
    },
    get isPaused() {
      return isPaused;
    },
    get attemptNumber() {
      return attemptNumber;
    },
    stop,
    pause,
    resume
  };
}
