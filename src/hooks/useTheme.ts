import * as React from 'react';

export default function useTheme() {
  const [isLightTheme, setIsLightTheme] = React.useState(true);

  function toggleTheme() {
    setIsLightTheme(prev => {
      const newTheme = !prev;
      localStorage.setItem('theme', newTheme ? 'light' : 'dark');
      newTheme
        ? document.documentElement.classList.remove('dark')
        : document.documentElement.classList.add('dark');
      return newTheme;
    });
  }
  return { isLightTheme, setIsLightTheme, toggleTheme };
}
