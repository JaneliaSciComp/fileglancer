import { useState, useCallback } from 'react';

export default function useTheme() {
  const [isLightTheme, setIsLightTheme] = useState(true);

  const toggleTheme = useCallback(() => {
    setIsLightTheme(prev => {
      const newTheme = !prev;
      localStorage.setItem('theme', newTheme ? 'light' : 'dark');
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      newTheme
        ? document.documentElement.classList.remove('dark')
        : document.documentElement.classList.add('dark');
      return newTheme;
    });
  }, []);

  return { isLightTheme, setIsLightTheme, toggleTheme };
}
