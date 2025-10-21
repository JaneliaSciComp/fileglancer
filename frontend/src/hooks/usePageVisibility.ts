import { useState, useEffect } from 'react';

/**
 * Hook that tracks whether the page is currently visible (active tab) or hidden (background/sleeping)
 * Uses the Page Visibility API to detect when the tab loses/gains focus
 *
 * @returns boolean - true if the page is visible, false if hidden
 */
export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    return typeof document !== 'undefined'
      ? document.visibilityState === 'visible'
      : true;
  });

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
}
