declare global {
  interface Window {
    fathom?: {
      trackEvent: (eventId: string, value?: number) => void;
    };
  }
}

export interface FathomEventOptions {
  eventId: string;
  value?: number;
}

export const trackEvent = ({ eventId, value }: FathomEventOptions): void => {
  try {
    if (
      typeof window !== 'undefined' &&
      window.fathom &&
      typeof window.fathom.trackEvent === 'function'
    ) {
      window.fathom.trackEvent(eventId, value);
    } else {
      console.debug(
        'Fathom Analytics not available, skipping event tracking:',
        eventId
      );
    }
  } catch (error) {
    console.warn('Error tracking Fathom event:', eventId, error);
  }
};

export const isFathomLoaded = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    window.fathom !== undefined &&
    typeof window.fathom.trackEvent === 'function'
  );
};
