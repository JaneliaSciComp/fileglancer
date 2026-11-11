import { useCallback } from 'react';

import useDarkMode from './useDarkMode';

// Theme source of truth is the `dark` class on <html> + localStorage.theme.
// `isDark` is read live from the DOM (via useDarkMode) so every consumer stays
// in sync; toggleTheme flips both the class and localStorage.
export default function useTheme() {
  const isDark = useDarkMode();

  const toggleTheme = useCallback(() => {
    const nextDark = !document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', nextDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', nextDark);
  }, []);

  return { isDark, toggleTheme };
}
