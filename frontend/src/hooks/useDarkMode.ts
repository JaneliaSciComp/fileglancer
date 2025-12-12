import { useEffect, useState } from 'react';

/**
 * Hook to detect dark mode from the document element's class list.
 * Observes changes to the document element's class attribute.
 * @returns boolean indicating if dark mode is active
 */
export default function useDarkMode(): boolean {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };

    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  return isDarkMode;
}
